import { Bot } from "grammy";
import { startAlphaScheduler, getLatestAlphaBoard } from "./services/scheduler.js";
import { getTopLiquidityMarkets, getMarketScan } from "./services/scout.js";

// Load Bot Token from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Error: BOT_TOKEN environment variable is not set.");
  console.error("Please set the BOT_TOKEN environment variable and try again.");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Error fallback message
const ERROR_MESSAGE = "⚠️ Data temporarily unavailable.\nPlease try again shortly.";

// ==========================================
// Bot Commands
// ==========================================

// /start command
bot.command("start", async (ctx) => {
  const text = `👋 *Welcome to Sera Scout*

Market intelligence bot for Sera Protocol.

*Available commands:*

/alpha - View tightest spread markets (cached)
/liquidity - View top liquidity markets
/scan <token> - Scan markets for a specific token
/about - Learn more about Sera Scout`;
  await ctx.reply(text, { parse_mode: "Markdown" });
});

// /about command
bot.command("about", async (ctx) => {
  const text = `*Sera Scout*

Telegram market intelligence bot powered by live Sera Protocol order book data.

*Features:*

• *Alpha Board*: Ranks markets by tightest spread.
• *Liquidity Leaderboard*: Ranks markets by deep liquidity.
• *Token Market Scan*: Looks up detailed info for any token symbol.`;
  await ctx.reply(text, { parse_mode: "Markdown" });
});

// /alpha command
bot.command("alpha", async (ctx) => {
  try {
    const { board, lastUpdated } = getLatestAlphaBoard();

    if (!lastUpdated) {
      await ctx.reply("🔄 Alpha Board is currently generating the first run. Please try again in a moment.");
      return;
    }

    const secondsAgo = Math.round((Date.now() - lastUpdated.getTime()) / 1000);
    
    let text = `🔥 *Sera Alpha Board*\n\n*Updated:*\n${secondsAgo} seconds ago\n\n`;

    const displayLimit = Math.min(board.length, 10);
    if (displayLimit === 0) {
      text += "No active markets with valid liquidity found.";
    } else {
      for (let i = 0; i < displayLimit; i++) {
        const entry = board[i];
        text += `${i + 1}. *${entry.market}*\n   Spread: ${entry.spreadPct.toFixed(4)}%\n\n`;
      }
    }

    await ctx.reply(text.trim(), { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Bot /alpha handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  }
});

// /liquidity command
bot.command("liquidity", async (ctx) => {
  try {
    // Show a loading message or typing action since this query might hit subgraph
    await ctx.replyWithChatAction("typing");
    
    const markets = await getTopLiquidityMarkets(10);
    
    let text = `💧 *Sera Liquidity Board*\n\n`;

    const displayLimit = Math.min(markets.length, 10);
    if (displayLimit === 0) {
      text += "No markets found with valid liquidity.";
    } else {
      for (let i = 0; i < displayLimit; i++) {
        const entry = markets[i];
        text += `${i + 1}. *${entry.market}*\n   Liquidity: ${entry.totalLiquidity.toFixed(4)}\n   Spread: ${entry.spreadPct.toFixed(4)}%\n\n`;
      }
    }

    await ctx.reply(text.trim(), { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Bot /liquidity handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  }
});

// /scan <token> command
bot.command("scan", async (ctx) => {
  try {
    const tokenArg = ctx.match?.trim().toUpperCase();
    if (!tokenArg) {
      await ctx.reply("Please specify a token symbol. Example: `/scan MYRT`", { parse_mode: "Markdown" });
      return;
    }

    await ctx.replyWithChatAction("typing");

    const results = await getMarketScan(tokenArg);
    if (results.length === 0) {
      await ctx.reply(`❌ No active markets found featuring *${tokenArg}*.`, { parse_mode: "Markdown" });
      return;
    }

    let text = `🔎 *${tokenArg} Market Scan*\n\n`;
    for (const r of results) {
      text += `*Market:* ${r.marketName}\n`;
      text += `*Latest Price:* ${r.latestPrice.toFixed(6)}\n`;
      text += `*Spread:* ${r.spreadPct !== null ? r.spreadPct.toFixed(4) + "%" : "N/A"}\n`;
      text += `*Maker Fee:* ${r.makerFee}\n`;
      text += `*Taker Fee:* ${r.takerFee}\n\n`;
    }

    await ctx.reply(text.trim(), { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Bot /scan handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  }
});

// Generic catch-all for errors to ensure long polling doesn't crash the bot process
bot.catch((err) => {
  console.error("Grammy Bot error boundary caught an error:", err);
});

// ==========================================
// Bot Startup
// ==========================================

async function start() {
  console.log("🤖 Initializing Sera Scout Telegram Bot...");
  
  // Start Alpha Scheduler automatically on startup
  console.log("⏰ Starting background Alpha Scheduler...");
  // Run asynchronously without blocking bot start, but wait for first generation if possible
  // so the bot starts with cache populated.
  startAlphaScheduler().catch((err) => {
    console.error("Failed to start Alpha Scheduler:", err);
  });

  // Start Grammy bot via long polling
  console.log("🚀 Bot is starting long polling...");
  await bot.start();
}

start().catch((err) => {
  console.error("Failed to start Telegram Bot server:", err);
  process.exit(1);
});
