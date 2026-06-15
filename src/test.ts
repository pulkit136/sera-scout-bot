import { listMarkets, getDepth } from "./services/sera.js";
import {
  getBestBid,
  getBestAsk,
  calculateSpread,
  formatMarketPair,
} from "./utils/market-utils.js";

async function main() {
  console.log("--- Querying Subgraph ---");
  
  // 1. List 10 markets
  const markets = await listMarkets(10);
  console.log(`Successfully listed ${markets.length} markets:\n`);
  
  // 2. Print symbol pairs
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    console.log(`Market ${i + 1}: ${formatMarketPair(market)} (${market.id})`);
  }
  console.log("\n----------------------------------------\n");

  if (markets.length === 0) {
    console.log("No markets found to test.");
    return;
  }

  // 3. Fetch depth for the first market returned
  const firstMarket = markets[0];
  const pairName = formatMarketPair(firstMarket);
  console.log(`Fetching depth for first market: ${pairName}...`);
  const depth = await getDepth(firstMarket.id, 10);

  // 4. Calculate bestBid, bestAsk, and spread
  const bestBid = getBestBid(depth);
  const bestAsk = getBestAsk(depth);
  const spreadInfo = calculateSpread(depth);

  // Helper to format scaled price (1e18) to float string
  const formatPriceFloat = (priceStr: string): string => {
    const priceNum = Number(priceStr) / 1e18;
    return priceNum.toFixed(6);
  };

  // 5. Output matches the requested layout
  console.log("\n--- Requested Output ---");
  console.log(`Market: ${pairName}\n`);

  if (bestBid) {
    console.log(`Best Bid: ${formatPriceFloat(bestBid.price)}`);
  } else {
    console.log("Best Bid: N/A");
  }

  if (bestAsk) {
    console.log(`Best Ask: ${formatPriceFloat(bestAsk.price)}`);
  } else {
    console.log("Best Ask: N/A");
  }

  console.log("\nSpread:");
  if (spreadInfo) {
    console.log(`${spreadInfo.percentage.toFixed(4)}%`);
  } else {
    console.log("N/A");
  }
}

main().catch((error) => {
  console.error("Test failed with error:", error);
});
