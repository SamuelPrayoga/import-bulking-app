// Pure, dependency-free — safe to import from both server code (lib/db.ts) and client components
// (components/SubmissionsExplorer.tsx), unlike lib/db.ts itself which pulls in better-sqlite3.

/** Parses the Form response's "DD/MM/YYYY H:MM:SS" timestamp into a sortable value. */
export function parseFormTimestamp(timestamp: string): number {
  const [datePart, timePart] = timestamp.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute, second] = (timePart ?? "0:0:0").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}
