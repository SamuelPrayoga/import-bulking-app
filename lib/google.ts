import { google } from "googleapis";
import { createHash } from "node:crypto";
import { isValidPicWhatsapp, normalizePicWhatsapp } from "./validate";
import type { FormResponseRecord } from "../types/index";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY belum diisi di .env.local"
    );
  }
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function extractDriveFileId(link: string): string | null {
  // Handles both "https://drive.google.com/file/d/<id>/view" and "...open?id=<id>" forms.
  const patterns = [/\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const re of patterns) {
    const match = link.match(re);
    if (match) return match[1];
  }
  return null;
}

function splitProvinsiKabKota(value: string): { declaredProvinsi: string; declaredKabKota: string } {
  const sepIndex = value.indexOf(" - ");
  if (sepIndex === -1) return { declaredProvinsi: value.trim(), declaredKabKota: "" };
  return {
    declaredProvinsi: value.slice(0, sepIndex).trim(),
    declaredKabKota: value.slice(sepIndex + 3).trim(),
  };
}

function makeSubmissionId(timestamp: string, email: string, driveLink: string): string {
  return createHash("sha256").update(`${timestamp}::${email}::${driveLink}`).digest("hex").slice(0, 24);
}

/** Reads every response row from the Google Form's response Sheet (columns A-K, header row skipped). */
export async function getFormResponses(): Promise<FormResponseRecord[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Form Responses 1!A:K";
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID belum diisi di .env.local");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values = res.data.values ?? [];
  const dataRows = values.slice(1); // skip header row

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const [
        timestamp = "",
        email = "",
        picName = "",
        picWhatsappRaw = "",
        provinsiKabKota = "",
        driveLink = "",
        instansi = "",
        , // H — unused blank column in the source sheet
        , // I — unused blank column in the source sheet
        , // J — unused blank column in the source sheet
        sheetStatus = "",
      ] = row.map((c) => String(c ?? ""));

      const { declaredProvinsi, declaredKabKota } = splitProvinsiKabKota(provinsiKabKota);

      const record: FormResponseRecord = {
        id: makeSubmissionId(timestamp, email, driveLink),
        timestamp,
        email,
        picName,
        picWhatsappRaw,
        picWhatsappNormalized: normalizePicWhatsapp(picWhatsappRaw),
        picWhatsappValid: isValidPicWhatsapp(picWhatsappRaw),
        declaredProvinsi,
        declaredKabKota,
        driveLink,
        driveFileId: extractDriveFileId(driveLink),
        instansi,
        sheetStatus,
      };
      return record;
    });
}

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads one uploaded submission file from Drive by its file id.
 * Some PICs link a native Google Sheet (a copy of the template made in Sheets) instead of an
 * uploaded .xlsx binary — Drive's `alt=media` download only works for binary files, so those
 * must instead be exported to xlsx via `files.export`.
 */
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const isGoogleNative = meta.data.mimeType?.startsWith("application/vnd.google-apps.") ?? false;

  const res = isGoogleNative
    ? await drive.files.export({ fileId, mimeType: XLSX_MIME_TYPE }, { responseType: "arraybuffer" })
    : await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });

  return Buffer.from(res.data as ArrayBuffer);
}
