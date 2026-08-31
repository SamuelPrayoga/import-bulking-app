// Next.js's official server-startup hook (runs once when the server process boots, not per
// request) — used here to start the auto-pull scheduler exactly once.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
