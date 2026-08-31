// Pure, dependency-free formatter for ISO timestamps (audit log / backup timestamps — distinct
// from lib/formTimestamp.ts, which parses the Form's own "DD/MM/YYYY H:MM:SS" format).

/** "12 menit lalu", "3 jam lalu", "5 hari lalu" — coarse relative time for a status widget, not a precise duration. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const diffMs = Date.now() - then;
  if (diffMs < 0) return "baru saja";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
