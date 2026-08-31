import ExcelJS from "exceljs";
import type { ReportRow } from "../types/index";

const HEADERS = [
  "No",
  "Nama",
  "NIK",
  "No WA (Agen)",
  "JOB",
  "Kota/Kabupaten",
  "Provinsi (File)",
  "Kode Prov",
  "Kode Kota",
  "Job ID",
  "Status",
  "Keterangan",
  "Catatan NIK",
  "Catatan Lokasi",
  "Sumber/PIC",
  "Instansi",
  "No WA PIC",
  "Waktu Submit",
] as const;

// Only the file-wide Provinsi (Form!C2) vs. the PIC's declared Provinsi is worth flagging — a
// row's own Kota/Kabupaten is expected to differ from what the PIC declared (one PIC can manage
// agents across several kab/kota), so that's never treated as a mismatch.
function buildCatatanLokasi(row: ReportRow): string {
  if (!row.locationMismatch) return "";
  return `Provinsi file ("${row.fileProvinsi ?? "-"}") tidak sesuai dengan yang didaftarkan di Form ("${row.declaredProvinsi}")`;
}

/** Builds a fresh, clean consolidated report workbook (not a copy of the original template). */
export function buildConsolidatedReport(rows: ReportRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Laporan");

  sheet.columns = HEADERS.map((header) => ({ header, key: header, width: 20 }));
  sheet.getRow(1).font = { bold: true };

  rows.forEach((row, i) => {
    const excelRow = sheet.addRow({
      No: i + 1,
      Nama: row.nama,
      NIK: row.nik,
      "No WA (Agen)": row.noWa,
      JOB: row.job,
      "Kota/Kabupaten": row.kotaKabupaten,
      "Provinsi (File)": row.fileProvinsi ?? "",
      "Kode Prov": row.kodeProv ?? "",
      "Kode Kota": row.kodeKota ?? "",
      "Job ID": row.jobId ?? "",
      Status: row.status === "valid" ? "Valid" : "Tidak Valid",
      Keterangan: row.errors.join("; "),
      "Catatan NIK": row.warnings.join("; "),
      "Catatan Lokasi": buildCatatanLokasi(row),
      "Sumber/PIC": row.picName,
      Instansi: row.instansi,
      "No WA PIC": row.picWhatsapp,
      "Waktu Submit": row.timestamp,
    });

    if (row.status === "invalid") {
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
      });
    }
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook;
}

export async function reportToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
