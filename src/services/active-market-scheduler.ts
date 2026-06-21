import { Bot } from "grammy";
import { getMarkets, getQuote } from "./sera-api.js";
import { setActiveSymbols } from "./active-market-storage.js";

let activeSchedulerInterval: NodeJS.Timeout | null = null;

async function testMarketLiquidity(m: any): Promise<{ hasLiquidity: boolean; queryError: boolean; isRateLimit: boolean }> {
  try {
    const payload = {
      from_token: m.base_address,
      to_token: m.quote_address,
      from_amount: m.min_ask_amount_raw,
      owner_address: "0x0000000000000000000000000000000000000000",
      recipient: "0x0000000000000000000000000000000000000000",
      expiration: Math.floor(Date.now() / 1000) + 120,
      gas_mode: "receive_less" as const
    };

    const quote = await getQuote(payload);
    const hasLiquidity = !!quote && !!quote.route_params.minOutputAmount;
    return { hasLiquidity, queryError: false, isRateLimit: false };
  } catch (err: any) {
    const errMsg = err.message || "";
    // If it's a known no_liquidity or routing failure, it's a valid inactive market check
    if (errMsg.toLowerCase().includes("no_liquidity") || errMsg.toLowerCase().includes("route")) {
      return { hasLiquidity: false, queryError: false, isRateLimit: false };
    }
    
    // Check if it's a 429 rate limit error
    const isRateLimit = errMsg.includes("429") || (err.status === 429);
    return { hasLiquidity: false, queryError: true, isRateLimit };
  }
}

export async function scanActiveMarkets(): Promise<void> {
  console.log("[Active Market Scheduler] Starting liquidity scan across all markets...");
  try {
    const markets = await getMarkets();
    const activeSymbols: string[] = [];
    let totalQueryErrors = 0;
    let totalRateLimits = 0;
    let successfulQuotes = 0;
    let failedQuotes = 0;
    
    const CONCURRENCY = 3; // Reduced to 3 to prevent API rate-limiting and command starvation

    for (let i = 0; i < markets.length; i += CONCURRENCY) {
      const batch = markets.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (m) => {
          const res = await testMarketLiquidity(m);
          return { symbol: m.symbol, ...res };
        })
      );

      for (const res of results) {
        if (res.queryError) {
          totalQueryErrors++;
          if (res.isRateLimit) {
            totalRateLimits++;
          }
        }
        if (res.hasLiquidity) {
          activeSymbols.push(res.symbol);
          successfulQuotes++;
        } else {
          failedQuotes++;
        }
      }

      // Delay between batches to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`[Active Market Scan Summary]:` +
      ` | Total Scanned: ${markets.length}` +
      ` | Successful Quotes: ${successfulQuotes}` +
      ` | Failed Quotes (No Liquidity): ${failedQuotes}` +
      ` | Query Errors: ${totalQueryErrors}` +
      ` | 429 Rate Limits: ${totalRateLimits}`);

    // Abort scan if more than 5% of queries failed to prevent state poisoning
    const errorThreshold = Math.ceil(markets.length * 0.05); // ~39 markets
    if (totalQueryErrors > errorThreshold) {
      console.error(`[Active Market Scheduler] Liquidity scan aborted. ${totalQueryErrors} queries failed (threshold: ${errorThreshold}). Preserving valid cache.`);
      return;
    }

    // Abort scan if 0 active markets were found (an exchange never has 0 active markets)
    if (activeSymbols.length === 0) {
      console.warn("[Active Market Scheduler] Liquidity scan returned 0 active markets. Preserving previous valid cache data.");
      return;
    }

    setActiveSymbols(activeSymbols);
    console.log(`[Active Market Scheduler] Completed liquidity scan. Found ${activeSymbols.length} active markets.`);
  } catch (error) {
    console.error("[Active Market Scheduler] Scan cycle failed:", error);
  }
}

export function startActiveMarketScheduler(bot: Bot) {
  if (activeSchedulerInterval) return;

  console.log("⏰ Starting background Active Market Scheduler (12h)...");

  // Run first scan after 10 seconds to populate database if empty
  setTimeout(() => {
    scanActiveMarkets().catch((err) => {
      console.error("[Active Market Scheduler] First scan failed:", err);
    });
  }, 10000);

  // Interval of 12 hours
  activeSchedulerInterval = setInterval(() => {
    scanActiveMarkets().catch((err) => {
      console.error("[Active Market Scheduler] Scan cycle failed:", err);
    });
  }, 12 * 60 * 60 * 1000);
}
