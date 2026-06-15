import { refreshAlphaBoard, type AlphaBoardEntry } from "./scout.js";

let latestAlphaBoard: AlphaBoardEntry[] = [];
let lastUpdated: Date | null = null;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Refreshes the Alpha Board in the background, measuring the execution duration,
 * handling failures gracefully, and updating the in-memory cache.
 */
export async function performRefresh(): Promise<void> {
  const startTime = performance.now();
  try {
    const freshBoard = await refreshAlphaBoard();
    latestAlphaBoard = freshBoard;
    lastUpdated = new Date();

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    console.log("Alpha Board refreshed successfully");
    console.log(`Duration: ${duration} ms`);
  } catch (error) {
    console.error(`[Alpha Scheduler] Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("[Alpha Scheduler] Continuing to serve previously cached Alpha Board.");
  }
}

/**
 * Starts the Alpha Scheduler.
 * Triggers the first board generation immediately on startup, and schedules recurring refreshes every 60 seconds.
 */
export async function startAlphaScheduler(): Promise<void> {
  if (intervalId) {
    console.warn("[Alpha Scheduler] Scheduler is already running.");
    return;
  }

  // Generate the first Alpha Board immediately on startup
  await performRefresh();

  // Schedule refreshes every 60 seconds
  intervalId = setInterval(async () => {
    await performRefresh();
  }, 60000);
}

/**
 * Stops the Alpha Scheduler.
 * Clears the active interval to allow clean exits (useful for tests and shutdown hooks).
 */
export function stopAlphaScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Alpha Scheduler] Scheduler stopped.");
  }
}

/**
 * Returns the latest successfully generated Alpha Board and the timestamp of when it was last updated.
 */
export function getLatestAlphaBoard() {
  return {
    board: latestAlphaBoard,
    lastUpdated,
  };
}
