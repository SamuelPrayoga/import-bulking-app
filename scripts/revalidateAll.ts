// Re-runs validation against every already-stored submission row using the current rules in
// lib/validate.ts, without re-downloading anything from Drive. Use this after a validation-logic
// change (like the invisible-character fix for "Pendamping PKH") so existing data reflects it
// without needing a slow full re-pull.
import {
  listSubmissionsChronological,
  getRawSubmissionRows,
  updateRowValidation,
  updateSubmissionCounts,
  updateSubmissionFileProvinsi,
  clearNikRegistry,
  registerNikForBackfill,
  findNikInRegistry,
} from "../lib/db";
import { validateSubmissionRows } from "../lib/validate";
import type { RawAgentRow } from "../types/index";

const NIK_RE = /^\d{16}$/;

async function main() {
  clearNikRegistry();
  const submissions = listSubmissionsChronological();

  let totalRows = 0;
  let totalValid = 0;

  for (const submission of submissions) {
    if (submission.status !== "processed") continue;

    const rawRows = getRawSubmissionRows(submission.id);
    // Backfill a blank Kota/Kabupaten from the PIC's own declared location — never override one
    // that's actually present in the row, since one PIC can legitimately manage agents across
    // several kab/kota.
    const agentRows: RawAgentRow[] = rawRows.map((r) => ({
      rowNumber: r.rowNumber,
      no: r.no,
      nama: r.nama,
      nik: r.nik,
      noWa: r.noWa,
      job: r.job,
      kotaKabupaten: r.kotaKabupaten || submission.declaredKabKota,
    }));

    // Same fallback lib/pullResponses.ts applies at pull time: a blank C2 (Provinsi) in the
    // uploaded file is a gap to fill from the PIC's own declared Provinsi, not left blank.
    const fileProvinsi = submission.fileProvinsi || submission.declaredProvinsi;
    if (fileProvinsi !== submission.fileProvinsi) {
      updateSubmissionFileProvinsi(submission.id, fileProvinsi);
    }

    const validated = validateSubmissionRows(agentRows, {
      fileProvinsi,
      nikExistsInRegistry: findNikInRegistry,
    });

    let validCount = 0;
    validated.forEach((v, i) => {
      const dbId = rawRows[i].dbId;
      updateRowValidation(dbId, {
        nama: v.nama,
        kotaKabupaten: v.kotaKabupaten,
        status: v.status,
        errors: v.errors,
        kodeProv: v.kodeProv,
        kodeKota: v.kodeKota,
        jobId: v.jobId,
      });
      if (v.status === "valid") validCount++;
      if (NIK_RE.test(v.nik)) {
        registerNikForBackfill(v.nik, submission.id, dbId, submission.picName, submission.timestamp);
      }
    });

    updateSubmissionCounts(submission.id, validCount, validated.length - validCount);
    totalRows += validated.length;
    totalValid += validCount;
  }

  console.log(
    `Revalidated ${totalRows} baris di ${submissions.filter((s) => s.status === "processed").length} submission. Valid: ${totalValid}, Tidak valid: ${totalRows - totalValid}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
