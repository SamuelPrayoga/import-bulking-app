// The response Sheet's "Status" column (K) is set by a separate process outside this app.
// "Done" means that submission has already been fully handled elsewhere; anything else (usually
// blank) means it hasn't.
export function isSheetStatusDone(sheetStatus: string): boolean {
  return sheetStatus.trim().toLowerCase() === "done";
}

export function formatSheetStatusLabel(sheetStatus: string): string {
  return isSheetStatusDone(sheetStatus) ? "Done" : "Pending";
}
