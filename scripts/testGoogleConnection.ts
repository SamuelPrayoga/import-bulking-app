// Guided-setup helper: run with `npm run test-google-connection` after filling in .env.local
// to confirm the service account can actually read the response Sheet and download a file from Drive.
import { downloadDriveFile, getFormResponses } from "../lib/google";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("Tidak menemukan .env.local di root project. Buat file itu dulu (lihat .env.example).");
  process.exit(1);
}

async function main() {
  console.log("Membaca respons dari Google Sheet...");
  const responses = await getFormResponses();
  console.log(`Ditemukan ${responses.length} baris respons.`);

  if (responses.length === 0) {
    console.log("Tidak ada baris respons untuk dicoba download. Setup Sheets API tampaknya OK.");
    return;
  }

  const sample = responses[responses.length - 1];
  console.log("Contoh baris terakhir:", {
    timestamp: sample.timestamp,
    picName: sample.picName,
    picWhatsappValid: sample.picWhatsappValid,
    declaredProvinsi: sample.declaredProvinsi,
    declaredKabKota: sample.declaredKabKota,
    driveFileId: sample.driveFileId,
  });

  if (!sample.driveFileId) {
    console.error("Tidak bisa mengekstrak file id dari link Drive:", sample.driveLink);
    process.exit(1);
  }

  console.log(`Mengunduh file ${sample.driveFileId} dari Drive...`);
  const buffer = await downloadDriveFile(sample.driveFileId);
  console.log(`Berhasil download, ukuran file: ${buffer.length} bytes.`);
  console.log("\nSetup Google Sheets + Drive API berfungsi dengan baik.");
}

main().catch((err) => {
  console.error("\nGagal:", err.message ?? err);
  process.exit(1);
});
