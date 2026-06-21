import { Bot } from "grammy";
import { getCachedMarkets, getTokens } from "./sera-api.js";
import { getNewestMarket } from "./discovery-storage.js";
import { getDigestSubscribedChats, getLastSentDate, setLastSentDate } from "./digest-storage.js";
import { getActiveSymbols } from "./active-market-storage.js";

let digestInterval: NodeJS.Timeout | null = null;

async function sendDailyDigest(bot: Bot) {
  try {
    const subscribers = getDigestSubscribedChats();
    if (subscribers.length === 0) return;

    const markets = await getCachedMarkets();
    const tokens = await getTokens();
    const activeSymbols = getActiveSymbols();

    const totalMarkets = markets.length;
    const activeMarkets = markets.filter(m => activeSymbols.includes(m.symbol));
    const totalActiveMarkets = activeMarkets.length;
    const totalTokens = tokens.length;

    // Calculate token connectivity counts
    const counts: Record<string, { symbol: string; count: number }> = {};
    for (const m of activeMarkets) {
      counts[m.base_address.toLowerCase()] = counts[m.base_address.toLowerCase()] || { symbol: m.base_symbol, count: 0 };
      counts[m.base_address.toLowerCase()].count++;

      counts[m.quote_address.toLowerCase()] = counts[m.quote_address.toLowerCase()] || { symbol: m.quote_symbol, count: 0 };
      counts[m.quote_address.toLowerCase()].count++;
    }

    const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
    const topTokenSymbol = sorted[0]?.symbol || "N/A";
    const topTokenCount = sorted[0]?.count || 0;

    const newest = getNewestMarket();
    const newestMarketText = newest ? `${newest.symbol} (discovered ${newest.discoveredAt})` : "None recently";

    const digestText = `📰 *Sera Daily Intelligence Digest*\n\n` +
      `📈 *Protocol Overview:*\n` +
      `• Total Active Markets: *${totalActiveMarkets}*\n` +
      `• Total Registered Markets: *${totalMarkets}*\n` +
      `• Registered Tokens: *${totalTokens}*\n` +
      `• Most Connected: *${topTokenSymbol}* (active in ${topTokenCount} markets)\n\n` +
      `🆕 *Latest Listed Market:*\n` +
      `• ${newestMarketText}\n\n` +
      `🔥 *Dominant Tokens:*\n` +
      `1. *${sorted[0]?.symbol || "N/A"}* (${sorted[0]?.count || 0} markets)\n` +
      `2. *${sorted[1]?.symbol || "N/A"}* (${sorted[1]?.count || 0} markets)\n` +
      `3. *${sorted[2]?.symbol || "N/A"}* (${sorted[2]?.count || 0} markets)\n\n` +
      `💡 _Use /discover to browse intelligence metrics interactively!_`;

    for (const chat of subscribers) {
      await bot.api.sendMessage(chat, digestText, { parse_mode: "Markdown" }).catch(err => {
        console.error(`[Digest Scheduler] Failed to send daily digest to chat ${chat}:`, err);
      });
    }
  } catch (error) {
    console.error("[Digest Scheduler] Error generating daily digest:", error);
  }
}

export function startDigestScheduler(bot: Bot) {
  if (digestInterval) return;

  console.log("⏰ Starting background Daily Digest Scheduler (checking hourly)...");

  // Check every hour
  digestInterval = setInterval(async () => {
    try {
      const now = new Date();
      const currentUtcDateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
      const currentUtcHour = now.getUTCHours();

      // Trigger daily digest around 9 AM UTC
      if (currentUtcHour >= 9) {
        const lastSent = getLastSentDate();
        if (lastSent !== currentUtcDateStr) {
          console.log(`[Digest Scheduler] Triggering daily digest for date: ${currentUtcDateStr}...`);
          await sendDailyDigest(bot);
          setLastSentDate(currentUtcDateStr);
        }
      }
    } catch (err) {
      console.error("[Digest Scheduler] Error in check cycle:", err);
    }
  }, 60 * 60 * 1000); // 1 hour
}

// Export for manual testing and triggers
export async function manualTriggerDigest(bot: Bot) {
  await sendDailyDigest(bot);
}
