import { Bot } from "grammy";
import { getMarkets } from "./sera-api.js";
import { getKnownMarkets, setKnownMarkets, getSubscribedChats } from "./discovery-storage.js";

let discoveryInterval: NodeJS.Timeout | null = null;

async function checkNewMarkets(bot: Bot) {
  try {
    const currentMarkets = await getMarkets();
    const currentSymbols = currentMarkets.map(m => m.symbol);

    const knownSymbols = getKnownMarkets();

    if (knownSymbols.length === 0) {
      // First run: save current markets list to storage without sending notifications
      setKnownMarkets(currentSymbols);
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
        const text = `🆕 *New Sera Market Listed*\n\n` +
          `*Pair:*\n` +
          `${nm.base_symbol} / ${nm.quote_symbol}\n\n` +
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
