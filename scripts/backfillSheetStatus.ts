// One-time backfill: fills in sheet_status and sheet_row_number for submissions that were
// processed before those columns existed, by re-reading the response Sheet (fast — one Sheets
// API call, no Drive downloads) and matching on submission id.
try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("Tidak menemukan .env.local di root project.");
  process.exit(1);
}

import { getFormResponses } from "../lib/google";
import { submissionExists, updateSheetStatus } from "../lib/db";

async function main() {
  const responses = await getFormResponses();
  let updated = 0;
  for (const response of responses) {
    if (await submissionExists(response.id)) {
      await updateSheetStatus(response.id, response.sheetStatus, response.sheetRowNumber);
      updated++;
    }
  }
  console.log(`Updated sheet_status/sheet_row_number for ${updated} existing submissions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
