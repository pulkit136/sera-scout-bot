import {
  startAlphaScheduler,
  stopAlphaScheduler,
  getLatestAlphaBoard,
  performRefresh,
} from "./services/scheduler.js";

async function main() {
  console.log("⏰ Starting Alpha Scheduler Verification Tests\n");

  try {
    // 1. Startup: startAlphaScheduler triggers the first board generation immediately
    console.log("--------------------------------------------------");
    console.log("1. Starting Alpha Scheduler (Immediate Startup Refresh)");
    console.log("--------------------------------------------------");
    await startAlphaScheduler();

    // 2. Retrieve and print initial cached board
    const initialResult = getLatestAlphaBoard();
    console.log(`\nInitial Board Last Updated: ${initialResult.lastUpdated?.toISOString()}`);
    console.log(`Initial Board Items Count: ${initialResult.board.length}`);
    if (initialResult.board.length > 0) {
      console.log(`Top Market Pair: ${initialResult.board[0].market} (Spread: ${initialResult.board[0].spreadPct.toFixed(4)}%)`);
    } else {
      console.log("No markets found.");
    }

    const initialTimestampStr = initialResult.lastUpdated?.getTime();

    // 3. Simulate failure by monkey-patching global fetch
    console.log("\n--------------------------------------------------");
    console.log("2. Simulating Subgraph Error / Network Failure during refresh");
    console.log("--------------------------------------------------");
    const originalFetch = globalThis.fetch;
    // Mock fetch to reject with an error
    globalThis.fetch = () => Promise.reject(new Error("Network connection lost"));

    // Call performRefresh to simulate the scheduler's interval execution
    console.log("Executing simulated scheduler refresh tick...");
    await performRefresh();

    // Verify scheduler behavior under error conditions
    const afterFailureResult = getLatestAlphaBoard();
    console.log(`\nBoard Last Updated after Failure: ${afterFailureResult.lastUpdated?.toISOString()}`);
    console.log(`Board Items Count after Failure: ${afterFailureResult.board.length}`);

    if (afterFailureResult.lastUpdated?.getTime() === initialTimestampStr) {
      console.log("✅ Success: Scheduler successfully continued serving previous board on failure.");
    } else {
      console.error("❌ Failure: Timestamp changed, indicating the failed run modified the cache.");
    }

    // 4. Restore fetch and stop the scheduler
    globalThis.fetch = originalFetch;
    console.log("\n--------------------------------------------------");
    console.log("3. Stopping Scheduler");
    console.log("--------------------------------------------------");
    stopAlphaScheduler();
    console.log("Verification finished successfully.");

  } catch (error) {
    console.error("Scheduler test failed:", error);
    stopAlphaScheduler();
  }
}

main();
