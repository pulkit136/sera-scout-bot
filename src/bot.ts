import { Bot } from "grammy";
import { startAlphaScheduler, getLatestAlphaBoard } from "./services/scheduler.js";
import { getTopLiquidityMarkets, getMarketScan } from "./services/scout.js";
import { getTokens, getQuote, getCachedMarkets } from "./services/sera-api.js";
import { parseUnits, formatUnits } from "./utils/decimal.js";
import { addAlert, listAlertsForChat, removeAlert } from "./services/alert-storage.js";
import { startAlertScheduler } from "./services/alert-scheduler.js";

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

Market companion bot for Sera Protocol.

*Available commands:*

/quote <from> <to> <amount> - Get a swap price quote
/markets - Discover available Sera trading pairs
/alert <from> <to> <above|below> <rate> - Create a quote rate alert
/myalerts - List your active alerts
/removealert <id> - Remove an active alert
/alpha - View tightest spread markets (legacy Sepolia)
/liquidity - View top liquidity markets (legacy Sepolia)
/scan <token> - Scan markets for a specific token (legacy Sepolia)
/about - Learn more about Sera Scout`;
  await ctx.reply(text, { parse_mode: "Markdown" });
});

// /about command
bot.command("about", async (ctx) => {
  const text = `*Sera Scout*

Telegram companion bot for the Sera Protocol, focused on market discovery, quote generation, and future trading tools.

*Features:*

• *Quote Generation*: Fetch real-time, slippage-protected swap quotes directly from Sera Mainnet.
• *Market Discovery*: Discover available trading pairs on Sera Mainnet using /markets.
• *Price Alerts*: Get real-time notifications for market movements using /alert.`;
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

// /quote <from_symbol> <to_symbol> <amount> command
bot.command("quote", async (ctx) => {
  try {
    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length !== 3) {
      await ctx.reply("⚠️ Usage: `/quote <from_symbol> <to_symbol> <amount>`\nExample: `/quote USDC USDT 10`", { parse_mode: "Markdown" });
      return;
    }

    const [fromSym, toSym, amountStr] = args;
    await ctx.replyWithChatAction("typing");

    // Fetch token configuration
    const tokens = await getTokens();
    const fromToken = tokens.find(t => t.symbol.toUpperCase() === fromSym.toUpperCase());
    const toToken = tokens.find(t => t.symbol.toUpperCase() === toSym.toUpperCase());

    if (!fromToken) {
      await ctx.reply(`❌ Unsupported source token symbol: *${fromSym}*`, { parse_mode: "Markdown" });
      return;
    }
    if (!toToken) {
      await ctx.reply(`❌ Unsupported destination token symbol: *${toSym}*`, { parse_mode: "Markdown" });
      return;
    }

    // Convert amount safely using decimal-safe conversion helper
    let atomicAmount: string;
    try {
      atomicAmount = parseUnits(amountStr, fromToken.decimals);
    } catch (e) {
      await ctx.reply(`❌ Invalid amount *${amountStr}*. Please specify a valid number.`, { parse_mode: "Markdown" });
      return;
    }

    // Fetch Quote from Mainnet REST API
    const quote = await getQuote({
      from_token: fromToken.address,
      to_token: toToken.address,
      from_amount: atomicAmount,
      owner_address: "0x0000000000000000000000000000000000000000", // Query-only placeholder
      recipient: "0x0000000000000000000000000000000000000000",
      expiration: Math.floor(Date.now() / 1000) + 120,
      gas_mode: "receive_less"
    });

    const minReceive = quote.route_params.minOutputAmount;
    const receiveAmount = formatUnits(minReceive, toToken.decimals);

    let text = `💸 *Sera Swap Quote*\n\n`;
    text += `• Input: ${amountStr} ${fromToken.symbol}\n`;

    if (quote.fee_breakdown && quote.fee_breakdown.gas_cost_from_token) {
      try {
        const gasCostRaw = parseUnits(quote.fee_breakdown.gas_cost_from_token, fromToken.decimals);
        const netInputRaw = BigInt(atomicAmount) - BigInt(gasCostRaw);

        if (netInputRaw > 0n) {
          const gasCost = quote.fee_breakdown.gas_cost_from_token;
          const gasCostUsd = quote.fee_breakdown.gas_cost_usd;
          const netInput = formatUnits(netInputRaw.toString(), fromToken.decimals);
          const numericMinReceive = Number(receiveAmount);
          const numericNetInput = Number(netInput);
          const effectiveRate = numericMinReceive / numericNetInput;

          text += `• Estimated Gas: ${gasCost} ${fromToken.symbol} ($${gasCostUsd})\n`;
          text += `• Amount Swapped: ${netInput} ${fromToken.symbol}\n`;
          text += `• Minimum Receive: ${receiveAmount} ${toToken.symbol}\n`;
          text += `• Effective Market Rate: ~${effectiveRate.toFixed(5)} ${toToken.symbol} per ${fromToken.symbol}\n\n`;
        } else {
          text += `• Minimum Receive: ${receiveAmount} ${toToken.symbol}\n\n`;
        }
      } catch (e) {
        text += `• Minimum Receive: ${receiveAmount} ${toToken.symbol}\n\n`;
      }
    } else {
      text += `• Minimum Receive: ${receiveAmount} ${toToken.symbol}\n\n`;
    }

    text += `ℹ️ Minimum receive includes slippage protection.`;

    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Bot /quote error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Failed to generate quote: *${msg}*`, { parse_mode: "Markdown" });
  }
});

// /markets command
bot.command("markets", async (ctx) => {
  try {
    const filterArg = ctx.match?.trim();
    await ctx.replyWithChatAction("typing");

    // Fetch markets from in-memory cache (5m TTL)
    const allMarkets = await getCachedMarkets();

    // Sort alphabetically by symbol
    const sortedMarkets = [...allMarkets].sort((a, b) => a.symbol.localeCompare(b.symbol));

    if (!filterArg) {
      // Display first 20 markets
      const displayLimit = Math.min(sortedMarkets.length, 20);
      const displayed = sortedMarkets.slice(0, displayLimit);

      let text = `📈 *Sera Markets*\n\n`;
      for (const m of displayed) {
        text += `• ${m.base_symbol} / ${m.quote_symbol}\n`;
      }
      text += `\nShowing ${displayLimit} of ${sortedMarkets.length} markets\n\n`;
      text += `Try:\n\`/markets USDC\``;

      await ctx.reply(text, { parse_mode: "Markdown" });
    } else {
      const searchStr = filterArg.toUpperCase();
      const filtered = sortedMarkets.filter(m => 
        m.symbol.toUpperCase().includes(searchStr) ||
        m.base_symbol.toUpperCase().includes(searchStr) ||
        m.quote_symbol.toUpperCase().includes(searchStr)
      );

      if (filtered.length === 0) {
        await ctx.reply(`❌ No markets found matching "${filterArg}"\n\nTry:\n\`/markets USDC\``, { parse_mode: "Markdown" });
        return;
      }

      const displayLimit = Math.min(filtered.length, 25);
      const displayed = filtered.slice(0, displayLimit);

      let text = `📈 *Sera Markets*\n\n`;
      for (const m of displayed) {
        text += `• ${m.base_symbol} / ${m.quote_symbol}\n`;
      }

      if (filtered.length > 25) {
        const remaining = filtered.length - 25;
        text += `...and ${remaining} more markets.\n`;
      }

      text += `\nShowing ${displayLimit} of ${filtered.length} matching markets`;

      await ctx.reply(text, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("Bot /markets handler error:", error);
    await ctx.reply("⚠️ Failed to load markets. Please try again later.");
  }
});

// /alert command
bot.command("alert", async (ctx) => {
  try {
    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length !== 4) {
      await ctx.reply("⚠️ Usage: \`/alert <from_token> <to_token> <above|below> <rate>\`\nExample: \`/alert EURS USDT above 1.08\`", { parse_mode: "Markdown" });
      return;
    }

    const [fromSym, toSym, conditionInput, rateStr] = args;
    const condition = conditionInput.toLowerCase();
    if (condition !== "above" && condition !== "below") {
      await ctx.reply("❌ Invalid condition. Must be either *above* or *below*.", { parse_mode: "Markdown" });
      return;
    }

    const targetRate = Number(rateStr);
    if (isNaN(targetRate) || targetRate <= 0) {
      await ctx.reply(`❌ Invalid target rate *${rateStr}*. Must be a positive number.`, { parse_mode: "Markdown" });
      return;
    }

    await ctx.replyWithChatAction("typing");

    // Fetch token configuration
    const tokens = await getTokens();
    const fromToken = tokens.find(t => t.symbol.toUpperCase() === fromSym.toUpperCase());
    const toToken = tokens.find(t => t.symbol.toUpperCase() === toSym.toUpperCase());

    if (!fromToken) {
      await ctx.reply(`❌ Unsupported source token symbol: *${fromSym}*`, { parse_mode: "Markdown" });
      return;
    }
    if (!toToken) {
      await ctx.reply(`❌ Unsupported destination token symbol: *${toSym}*`, { parse_mode: "Markdown" });
      return;
    }

    // Add alert to persistent storage
    const alert = addAlert({
      telegram_chat_id: ctx.chat.id,
      from_token: fromToken.symbol,
      from_address: fromToken.address,
      from_decimals: fromToken.decimals,
      to_token: toToken.symbol,
      to_address: toToken.address,
      to_decimals: toToken.decimals,
      condition: condition as "above" | "below",
      target_rate: targetRate
    });

    const triggerLabel = condition === "above" ? "Above" : "Below";
    await ctx.reply(`✅ *Alert Created Successfully*\n\n` +
      `• *Pair:* ${alert.from_token} → ${alert.to_token}\n` +
      `• *Trigger:* ${triggerLabel} ${alert.target_rate.toFixed(4)}\n` +
      `• *Alert ID:* ${alert.id}`, { parse_mode: "Markdown" });

  } catch (error) {
    console.error("Bot /alert error:", error);
    await ctx.reply("⚠️ Failed to create alert. Please try again.");
  }
});

// /myalerts command
bot.command("myalerts", async (ctx) => {
  try {
    const alerts = listAlertsForChat(ctx.chat.id);
    if (alerts.length === 0) {
      await ctx.reply("ℹ️ You have no active quote alerts.");
      return;
    }

    let text = `🔔 *Active Quote Alerts*\n\n`;
    for (const a of alerts) {
      const condLabel = a.condition === "above" ? "Above" : "Below";
      text += `• *ID ${a.id}:* ${a.from_token} → ${a.to_token} when ${condLabel} ${a.target_rate.toFixed(4)}\n`;
    }
    text += `\nTo remove an alert, use:\n\`/removealert <id>\``;
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Bot /myalerts error:", error);
    await ctx.reply("⚠️ Failed to load alerts.");
  }
});

// /removealert command
bot.command("removealert", async (ctx) => {
  try {
    const alertId = ctx.match?.trim();
    if (!alertId) {
      await ctx.reply("⚠️ Usage: \`/removealert <id>\`\nExample: \`/removealert 123\`", { parse_mode: "Markdown" });
      return;
    }

    const userAlerts = listAlertsForChat(ctx.chat.id);
    const exists = userAlerts.some(a => a.id === alertId);
    if (!exists) {
      await ctx.reply(`❌ Alert ID *${alertId}* not found under your active alerts.`, { parse_mode: "Markdown" });
      return;
    }

    const success = removeAlert(alertId);
    if (success) {
      await ctx.reply(`✅ Alert ID *${alertId}* has been removed.`, { parse_mode: "Markdown" });
    } else {
      await ctx.reply(`❌ Failed to remove alert ID *${alertId}*.`, { parse_mode: "Markdown" });
    }
  } catch (error) {
    console.error("Bot /removealert error:", error);
    await ctx.reply("⚠️ Failed to remove alert.");
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
  
  // Start Quote Alert Scheduler
  startAlertScheduler(bot);
  
  await bot.start();
}

start().catch((err) => {
  console.error("Failed to start Telegram Bot server:", err);
  process.exit(1);
});
