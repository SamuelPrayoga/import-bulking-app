import { downloadDriveFile, getFormResponses } from "./google";
import { loadWorkbook, parseFormSheet } from "./parseTemplate";
import { SMART_MAP_AUTO_ACCEPT_SCORE, trySmartMap } from "./smartMapping";
import { checkProvinceMismatch, isJobFallbackWarning, isKabKotaAutoFixWarning, isNameMismatchWarning, validateSubmissionRows } from "./validate";
import { batchUpdateSheetStatuses, findNikHistory, getSubmissionSheetStatuses, saveProcessedSubmission } from "./db";
import type { RawAgentRow, SubmissionRecord } from "../types/index";

export interface PullResponsesResult {
  totalResponses: number;
  newlyProcessed: number;
  smartMapped: number;
  alreadyProcessed: number;
  failed: number;
  errors: Array<{ picName: string; timestamp: string; message: string }>;
}

interface ExtractedFile {
  fileProvinsi: string;
  rows: RawAgentRow[];
  importMethod: "template" | "smart-mapped";
  mappingScore: number | null;
}

/**
 * Reads the "Form" sheet the normal way; if the file isn't shaped like the official template at
 * all, falls back to lib/smartMapping.ts's best-effort column detection. A smart-mapped result is
 * only trusted automatically at SMART_MAP_AUTO_ACCEPT_SCORE confidence or above — anything lower
 * is treated as a failure so the operator reviews it manually instead of silently importing a
 * guess. declaredProvinsi fills in the Provinsi for a smart-mapped file, since there's no
 * template C2 cell to read it from.
 */
async function extractSubmissionData(buffer: Buffer, declaredProvinsi: string): Promise<ExtractedFile> {
  try {
    const workbook = await loadWorkbook(buffer);
    const parsed = parseFormSheet(workbook);
    return { fileProvinsi: parsed.fileProvinsi, rows: parsed.rows, importMethod: "template", mappingScore: null };
  } catch (templateErr) {
    // exceljs only understands .xlsx and silently yields an empty workbook for a legacy .xls
    // buffer (parseFormSheet then fails to find "Form" the same way it would for any other
    // wrong-shaped file) — lib/smartMapping.ts re-reads the raw buffer with a library that
    // handles both formats, so the fallback still works for .xls submissions.
    const smart = trySmartMap(buffer);

    if (!smart) throw templateErr;

    if (smart.score < SMART_MAP_AUTO_ACCEPT_SCORE) {
      throw new Error(
        `${(templateErr as Error).message}. Sistem mencoba deteksi otomatis di sheet "${smart.sheetName}" ` +
          `(kolom ketemu: ${smart.fieldsDetected.join(", ") || "-"}) tapi skor kecocokan cuma ${smart.score}% ` +
          `(minimal ${SMART_MAP_AUTO_ACCEPT_SCORE}% untuk diproses otomatis) — perlu direview manual.`
      );
    }

    return { fileProvinsi: declaredProvinsi, rows: smart.rows, importMethod: "smart-mapped", mappingScore: smart.score };
  }
}

/**
 * Fills a row's blank Kota/Kabupaten with the PIC's own declared location — never overrides one
 * that's actually present, since one PIC can legitimately manage agents across several kab/kota
 * (a row's Kota/Kabupaten is expected to differ from what the PIC declared, that's normal).
 * Applies regardless of import method: the official template can be submitted with the column
 * left blank just as easily as a smart-mapped file that has no location column at all.
 */
function fillMissingKotaKabupaten(rows: RawAgentRow[], declaredKabKota: string): RawAgentRow[] {
  return rows.map((r) => (r.kotaKabupaten ? r : { ...r, kotaKabupaten: declaredKabKota }));
}

/** Pulls every Form response, skips ones already processed, and validates+saves the rest. */
export async function pullNewResponses(): Promise<PullResponsesResult> {
  const responses = await getFormResponses();

  // Fetched once up front rather than one "does this exist" query per response — with hundreds of
  // historical responses (the common case: everything already processed, nothing new this pull),
  // that used to mean two round trips to Turso per response, easily enough to exceed Vercel's
  // function timeout even though there was no actual work to do.
  const existingStatuses = await getSubmissionSheetStatuses();
  const knownIds = new Set(existingStatuses.keys());
  const sheetStatusUpdates: Array<{ id: string; sheetStatus: string; sheetRowNumber: number }> = [];

  const result: PullResponsesResult = {
    totalResponses: responses.length,
    newlyProcessed: 0,
    smartMapped: 0,
    alreadyProcessed: 0,
    failed: 0,
    errors: [],
  };

  for (const response of responses) {
    // Checked against knownIds (live-updated below), not just the up-front existingStatuses
    // snapshot — the Sheet can legitimately contain two rows with the same response id (e.g. a
    // resubmission), and the second one must be recognized as already-handled by the first
    // occurrence within this same run, or it hits a UNIQUE constraint trying to insert it twice.
    if (knownIds.has(response.id)) {
      // The response row itself (e.g. its "Status" column K) can still change after we've already
      // processed the file — collected here and written in one batched round trip at the end,
      // rather than one update per response, for the same reason as the up-front fetch above.
      // (Only meaningful for a row that already existed before this run — a same-run duplicate's
      // status was already written fresh by its first occurrence, so there's nothing to compare.)
      const existingEntry = existingStatuses.get(response.id);
      if (existingEntry && (existingEntry.sheetStatus !== response.sheetStatus || existingEntry.sheetRowNumber !== response.sheetRowNumber)) {
        sheetStatusUpdates.push({ id: response.id, sheetStatus: response.sheetStatus, sheetRowNumber: response.sheetRowNumber });
      }
      result.alreadyProcessed++;
      continue;
    }

    try {
      if (!response.driveFileId) {
        throw new Error(`Tidak bisa mengekstrak file id dari link Drive: "${response.driveLink}"`);
      }

      const buffer = await downloadDriveFile(response.driveFileId);
      const { fileProvinsi: rawFileProvinsi, rows: extractedRows, importMethod, mappingScore } = await extractSubmissionData(
        buffer,
        response.declaredProvinsi
      );
      const rows = fillMissingKotaKabupaten(extractedRows, response.declaredKabKota);

      // Check the mismatch against what the file itself actually said, before falling back —
      // a blank C2 is a gap to fill in, not a "provinsi tidak sesuai" mismatch to flag.
      const locationMismatch = checkProvinceMismatch(rawFileProvinsi, response.declaredProvinsi);
      const fileProvinsi = rawFileProvinsi || response.declaredProvinsi;

      const validatedRows = await validateSubmissionRows(rows, {
        fileProvinsi,
        declaredProvinsi: response.declaredProvinsi,
        declaredKabKota: response.declaredKabKota,
        findNikHistory,
      });

      const validCount = validatedRows.filter((r) => r.status === "valid").length;
      const invalidCount = validatedRows.length - validCount;
      const hasNameMismatch = validatedRows.some((r) => r.warnings.some(isNameMismatchWarning));
      const hasKabKotaAutoFix = validatedRows.some((r) => r.warnings.some(isKabKotaAutoFixWarning));
      const hasJobFallback = validatedRows.some((r) => r.warnings.some(isJobFallbackWarning));

      const submission: SubmissionRecord = {
        id: response.id,
        timestamp: response.timestamp,
        email: response.email,
        picName: response.picName,
        picWhatsapp: response.picWhatsappRaw,
        picWhatsappValid: response.picWhatsappValid,
        declaredProvinsi: response.declaredProvinsi,
        declaredKabKota: response.declaredKabKota,
        instansi: response.instansi,
        driveFileId: response.driveFileId,
        fileProvinsi,
        sheetStatus: response.sheetStatus,
        locationMismatch,
        validCount,
        invalidCount,
        status: "processed",
        processedAt: new Date().toISOString(),
        errorMessage: null,
        importMethod,
        mappingScore,
        followedUpAt: null,
        hasNameMismatch,
        hasKabKotaAutoFix,
        hasJobFallback,
        sheetRowNumber: response.sheetRowNumber,
      };

      await saveProcessedSubmission(submission, validatedRows);
      knownIds.add(response.id);
      result.newlyProcessed++;
      if (importMethod === "smart-mapped") result.smartMapped++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push({ picName: response.picName, timestamp: response.timestamp, message });

      // Still record a "failed" submission row so the same broken response isn't retried forever
      // on every future pull — the operator can see it (and the reason) in the history and follow
      // up manually. Wrapped in its own try/catch as defense in depth: if the response above
      // somehow actually committed despite throwing (a client/transport quirk, not something this
      // code can fully rule out), this insert would itself fail on the same id — that must not take
      // down the rest of the pull for every other response still queued up.
      if (!knownIds.has(response.id)) {
        knownIds.add(response.id);
        try {
          await saveProcessedSubmission(
            {
              id: response.id,
              timestamp: response.timestamp,
              email: response.email,
              picName: response.picName,
              picWhatsapp: response.picWhatsappRaw,
              picWhatsappValid: response.picWhatsappValid,
              declaredProvinsi: response.declaredProvinsi,
              declaredKabKota: response.declaredKabKota,
              instansi: response.instansi,
              driveFileId: response.driveFileId ?? "",
              fileProvinsi: null,
              sheetStatus: response.sheetStatus,
              locationMismatch: false,
              validCount: 0,
              invalidCount: 0,
              status: "failed",
              processedAt: new Date().toISOString(),
              errorMessage: message,
              importMethod: "template",
              mappingScore: null,
              followedUpAt: null,
              hasNameMismatch: false,
              hasKabKotaAutoFix: false,
              hasJobFallback: false,
              sheetRowNumber: response.sheetRowNumber,
            },
            []
          );
        } catch {
          // Already recorded in result.errors above; a submission id already existing here means
          // the earlier attempt actually succeeded despite throwing, so there's nothing left to do.
        }
      }
    }
  }

  await batchUpdateSheetStatuses(sheetStatusUpdates);

  return result;
}
