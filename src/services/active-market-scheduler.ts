import { Bot } from "grammy";
import { getMarkets, getQuote } from "./sera-api.js";
import { setActiveSymbols } from "./active-market-storage.js";

let activeSchedulerInterval: NodeJS.Timeout | null = null;

async function testMarketLiquidity(m: any): Promise<boolean> {
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
    return !!quote && !!quote.route_params.minOutputAmount;
  } catch (e) {
    return false;
  }
}

export async function scanActiveMarkets(): Promise<void> {
  console.log("[Active Market Scheduler] Starting liquidity scan across all markets...");
  try {
    const markets = await getMarkets();
    const activeSymbols: string[] = [];
    const CONCURRENCY = 15;

    for (let i = 0; i < markets.length; i += CONCURRENCY) {
      const batch = markets.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (m) => {
          const hasLiquidity = await testMarketLiquidity(m);
          return { symbol: m.symbol, hasLiquidity };
        })
      );

      for (const res of results) {
        if (res.hasLiquidity) {
          activeSymbols.push(res.symbol);
        }
      }

      // Delay between batches to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setActiveSymbols(activeSymbols);
    console.log(`[Active Market Scheduler] Completed liquidity scan. Found ${activeSymbols.length} active markets.`);
  } catch (error) {
    console.error("[Active Market Scheduler] Scan cycle failed:", error);
  }
}

export function startActiveMarketScheduler(bot: Bot) {
  if (activeSchedulerInterval) return;

  console.log("⏰ Starting background Active Market Scheduler (60m)...");

  // Run first scan after 5 seconds to populate database if empty
  setTimeout(() => {
    scanActiveMarkets().catch((err) => {
      console.error("[Active Market Scheduler] First scan failed:", err);
    });
  }, 5000);

  // Interval of 60 minutes
  activeSchedulerInterval = setInterval(() => {
    scanActiveMarkets().catch((err) => {
      console.error("[Active Market Scheduler] Scan cycle failed:", err);
    });
  }, 60 * 60 * 1000);
}
