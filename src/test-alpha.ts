import { getAlphaBoard, getMarketScan, refreshAlphaBoard } from "./services/scout.js";

async function main() {
  console.log("🔥 Sera Alpha Board Cache & Optimization Tests\n");

  try {
    console.log("----------------------------------------");
    console.log("1. Fetching Alpha Board (First Run - Empty Cache)");
    console.log("----------------------------------------");
    const board1 = await getAlphaBoard(10);

    if (board1.length === 0) {
      console.log("No markets found with valid bid/ask liquidity.");
      return;
    }

    console.log("\nTop 10 tightest spread markets (First Run):");
    for (let i = 0; i < board1.length; i++) {
      const entry = board1[i];
      console.log(`Rank ${i + 1}: ${entry.market} | Bid: ${entry.bestBid.toFixed(6)} | Ask: ${entry.bestAsk.toFixed(6)} | Spread: ${entry.spreadPct.toFixed(4)}%`);
    }

    console.log("\n----------------------------------------");
    console.log("2. Fetching Alpha Board (Second Run - Should Hit Cache)");
    console.log("----------------------------------------");
    const board2 = await getAlphaBoard(10);
    console.log(`Retrieved ${board2.length} cached markets from Alpha Board.`);

    console.log("\n----------------------------------------");
    console.log("3. Fetching Alpha Board (Third Run - Using refreshAlphaBoard to bypass cache)");
    console.log("----------------------------------------");
    const board3 = await refreshAlphaBoard(10);
    console.log(`Retrieved ${board3.length} fresh markets from Alpha Board after bypass.`);

    // Brief demo of getMarketScan for "MYRC"
    console.log("\n----------------------------------------");
    console.log("🔍 Market Scan Demo: MYRC (Should use cache)");
    console.log("----------------------------------------");
    const scanResults = await getMarketScan("MYRC");
    for (const r of scanResults) {
      console.log(`Market: ${r.marketName}`);
      console.log(`- Latest Price: ${r.latestPrice.toFixed(6)}`);
      console.log(`- Maker/Taker Fee: ${r.makerFee}/${r.takerFee}`);
      console.log(`- Best Bid/Ask: ${r.bestBid ? r.bestBid.toFixed(6) : "N/A"} / ${r.bestAsk ? r.bestAsk.toFixed(6) : "N/A"}`);
      console.log(`- Spread: ${r.spreadPct ? r.spreadPct.toFixed(4) + "%" : "N/A"}\n`);
    }

  } catch (error) {
    console.error("Failed to load Alpha Board:", error);
  }
}

main();

