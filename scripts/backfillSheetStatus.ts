// One-time backfill: fills in sheet_status for submissions that were processed before that
// column existed, by re-reading the response Sheet (fast — one Sheets API call, no Drive
// downloads) and matching on submission id.
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
    if (submissionExists(response.id)) {
      updateSheetStatus(response.id, response.sheetStatus);
      updated++;
    }
  }
  console.log(`Updated sheet_status for ${updated} existing submissions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
