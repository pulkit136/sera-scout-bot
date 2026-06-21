import { Bot } from "grammy";
import { getMarkets, getQuote } from "./sera-api.js";
import { getKnownMarkets, setKnownMarkets, getSubscribedChats, setNewestMarket } from "./discovery-storage.js";

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

let discoveryInterval: NodeJS.Timeout | null = null;

async function checkNewMarkets(bot: Bot) {
  try {
    const currentMarkets = await getMarkets();
    const currentSymbols = currentMarkets.map(m => m.symbol);

    const knownSymbols = getKnownMarkets();

    if (knownSymbols.length === 0) {
      // First run: save current markets list to storage without sending notifications
      setKnownMarkets(currentSymbols);
      if (currentMarkets.length > 0) {
        const lastMarket = currentMarkets[currentMarkets.length - 1];
        setNewestMarket(`${lastMarket.base_symbol} / ${lastMarket.quote_symbol}`, "Initial Scan");
      }
      console.log(`[Discovery Scheduler] First-run initialized. Saved ${currentSymbols.length} known markets.`);
      return;
    }

    // Find new markets
    const newMarkets = currentMarkets.filter(m => !knownSymbols.includes(m.symbol));

    if (newMarkets.length > 0) {
      const subscribers = getSubscribedChats();
      console.log(`[Discovery Scheduler] Found ${newMarkets.length} new markets. Notifying ${subscribers.length} chats.`);

      const utcTime = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

      for (const nm of newMarkets) {
        const hasLiquidity = await testMarketLiquidity(nm);
        const wording = hasLiquidity ? "New Market Listed" : "New Market Registered";
        
        const text = `🆕 *${wording}*\n\n` +
          `*Pair:*\n` +
          `${nm.base_symbol} / ${nm.quote_symbol}\n\n` +
          `*Liquidity Status:*\n` +
          `${hasLiquidity ? "🟢 Active Liquidity Detected" : "🔴 No Liquidity Present"}\n\n` +
          `*Discovered:*\n` +
          `${utcTime}\n\n` +
          `Use:\n` +
          `\`/quote ${nm.base_symbol} ${nm.quote_symbol} 100\`\n\n` +
          `to check pricing.`;

        for (const chat of subscribers) {
          bot.api.sendMessage(chat, text, { parse_mode: "Markdown" }).catch(sendErr => {
            console.error(`[Discovery Scheduler] Failed to notify chat ${chat}:`, sendErr);
          });
        }
      }

      // Update newest market
      const newest = newMarkets[newMarkets.length - 1];
      setNewestMarket(`${newest.base_symbol} / ${newest.quote_symbol}`, utcTime);

      // Update known markets in storage
      const updatedKnown = Array.from(new Set([...knownSymbols, ...currentSymbols]));
      setKnownMarkets(updatedKnown);
    }
  } catch (error) {
    console.error("[Discovery Scheduler] Error in check cycle:", error);
  }
}

export function startDiscoveryScheduler(bot: Bot) {
  if (discoveryInterval) return;

  console.log("⏰ Starting background Market Discovery Scheduler (30m)...");
  
  // Run first check cycle after 10 seconds to populate known markets if empty
  setTimeout(() => {
    checkNewMarkets(bot).catch(err => {
      console.error("[Discovery Scheduler] First check failed:", err);
    });
  }, 10000);

  // Set interval of 30 minutes
  discoveryInterval = setInterval(() => {
    checkNewMarkets(bot).catch(err => {
      console.error("[Discovery Scheduler] Error in check cycle:", err);
    });
  }, 30 * 60 * 1000);
}

// Export for manual testing
export async function manualCheckNewMarkets(bot: Bot) {
  await checkNewMarkets(bot);
}
