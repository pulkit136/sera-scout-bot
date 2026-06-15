import { getTopLiquidityMarkets } from "./services/scout.js";

async function main() {
  console.log("💧 Sera Liquidity Leaderboard");
  console.log("Top 10 markets ranked by total liquidity (top 5 bids + top 5 asks depth levels).\n");

  try {
    const startTime = performance.now();
    const markets = await getTopLiquidityMarkets(10);
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    console.log(`Liquidity Board generated in ${duration} ms\n`);

    if (markets.length === 0) {
      console.log("No markets found with valid liquidity.");
      return;
    }

    console.log("Rank | Market    | Total Liquidity | Spread %");
    console.log("-----|-----------|-----------------|-----------");
    for (let i = 0; i < markets.length; i++) {
      const entry = markets[i];
      const rankStr = String(i + 1).padStart(2, " ");
      const marketStr = entry.market.padEnd(9, " ");
      const liquidityStr = entry.totalLiquidity.toFixed(4).padStart(15, " ");
      const spreadStr = entry.spreadPct.toFixed(4).padStart(8, " ") + "%";
      console.log(`${rankStr}   | ${marketStr} | ${liquidityStr} | ${spreadStr}`);
    }

    // Double check sorting order
    let isSorted = true;
    for (let i = 1; i < markets.length; i++) {
      if (markets[i].totalLiquidity > markets[i - 1].totalLiquidity) {
        isSorted = false;
        break;
      }
    }

    console.log("\n----------------------------------------");
    if (isSorted) {
      console.log("✅ Success: Markets are correctly sorted in descending order of total liquidity.");
    } else {
      console.error("❌ Failure: Markets are NOT correctly sorted in descending order.");
    }
    console.log("----------------------------------------");

  } catch (error) {
    console.error("Failed to load liquidity leaderboard:", error);
  }
}

main();
