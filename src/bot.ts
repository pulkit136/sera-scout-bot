import { Bot, InlineKeyboard } from "grammy";
import { startAlphaScheduler, getLatestAlphaBoard } from "./services/scheduler.js";
import { getTopLiquidityMarkets, getMarketScan } from "./services/scout.js";
import { getTokens, getQuote, getCachedMarkets, getMarketsCacheTimestamp } from "./services/sera-api.js";
import { parseUnits, formatUnits } from "./utils/decimal.js";
import { addAlert, listAlertsForChat, removeAlert } from "./services/alert-storage.js";
import { startAlertScheduler } from "./services/alert-scheduler.js";
import { subscribeChat, unsubscribeChat, getNewestMarket } from "./services/discovery-storage.js";
import { startDiscoveryScheduler } from "./services/discovery-scheduler.js";
import { subscribeDigest, unsubscribeDigest } from "./services/digest-storage.js";
import { startDigestScheduler } from "./services/digest-scheduler.js";

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
// Session State Management
// ==========================================

interface UserSession {
  state: "idle" | "awaiting_quote_pair" | "awaiting_quote_amount" | "awaiting_alert_rate";
  pendingQuote?: { from: string; to: string };
  pendingAlert?: { from: string; to: string; condition: "above" | "below" };
}
const userSessions = new Map<number, UserSession>();

// ==========================================
// Interactive Keyboard & Screen Generators
// ==========================================

function getMainMenu() {
  const text = `👋 *Welcome to Sera Scout*\n\n` +
    `Sera Scout is your interactive companion for the Sera Protocol.\n` +
    `Use the menu below to navigate markets, price discovery, compare tokens, and configure alerts.`;
  const keyboard = new InlineKeyboard()
    .text("💸 Swap Quote", "menu_quote").row()
    .text("📈 Browse Markets", "mkt:1").row()
    .text("💡 Discover Insights", "discover")
    .text("🔥 Trending", "trd:1").row()
    .text("📊 Stats", "stats")
    .text("🔔 My Alerts", "alerts:1");
  return { text, keyboard };
}

function getQuoteMenu() {
  const text = `💸 *Swap Quote*\n\n` +
    `Choose one of the popular trading pairs below, or click *✏️ Custom Pair* to enter a different pair.`;
  const keyboard = new InlineKeyboard()
    .text("USDC / USDT", "q_flow:USDC:USDT")
    .text("EURS / USDT", "q_flow:EURS:USDT").row()
    .text("MXNT / USDC", "q_flow:MXNT:USDC")
    .text("BRZ / USDT", "q_flow:BRZ:USDT").row()
    .text("✏️ Custom Pair", "q_custom_start").row()
    .text("🏠 Home", "home");
  return { text, keyboard };
}

async function getMarketsPage(page: number, filter?: string) {
  const allMarkets = await getCachedMarkets();
  let sortedMarkets = [...allMarkets].sort((a, b) => a.symbol.localeCompare(b.symbol));

  const filterStr = filter?.toUpperCase() || "";
  if (filterStr) {
    sortedMarkets = sortedMarkets.filter(m => 
      m.symbol.toUpperCase().includes(filterStr) ||
      m.base_symbol.toUpperCase().includes(filterStr) ||
      m.quote_symbol.toUpperCase().includes(filterStr)
    );
  }

  const pageSize = 8;
  const totalMarkets = sortedMarkets.length;
  const totalPages = Math.ceil(totalMarkets / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * pageSize;
  const pageMarkets = sortedMarkets.slice(startIdx, startIdx + pageSize);

  let text = `📈 *Sera Markets*\n\n`;
  if (filterStr) {
    text += `Filtered by: *${filterStr}*\n\n`;
  }
  
  if (pageMarkets.length === 0) {
    text += `No markets found.`;
  } else {
    text += `Select a market pair below to view details and execute actions:\n\n`;
  }

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < pageMarkets.length; i += 2) {
    const m1 = pageMarkets[i];
    const m2 = pageMarkets[i + 1];
    
    const filterParam = filterStr ? filterStr.substring(0, 10) : "";
    if (m1 && m2) {
      keyboard.text(`${m1.base_symbol}/${m1.quote_symbol}`, `mkt_det:${m1.base_symbol}:${m1.quote_symbol}:${currentPage}:${filterParam}`)
              .text(`${m2.base_symbol}/${m2.quote_symbol}`, `mkt_det:${m2.base_symbol}:${m2.quote_symbol}:${currentPage}:${filterParam}`).row();
    } else if (m1) {
      keyboard.text(`${m1.base_symbol}/${m1.quote_symbol}`, `mkt_det:${m1.base_symbol}:${m1.quote_symbol}:${currentPage}:${filterParam}`).row();
    }
  }

  if (currentPage > 1 || currentPage < totalPages) {
    const filterParam = filterStr ? filterStr.substring(0, 10) : "";
    if (currentPage > 1) {
      keyboard.text("⬅ Prev", `mkt:${currentPage - 1}:${filterParam}`);
    }
    if (currentPage < totalPages) {
      keyboard.text("➡ Next", `mkt:${currentPage + 1}:${filterParam}`);
    }
    keyboard.row();
  }

  keyboard.text("🏠 Home", "home");

  text += `Page ${currentPage} of ${totalPages} (${totalMarkets} total markets)\n\n`;
  text += `You can also search/filter using: \`/markets <query>\``;

  return { text, keyboard };
}

async function getMarketDetails(base: string, quote: string, backPage: number, filter?: string) {
  const allMarkets = await getCachedMarkets();
  const market = allMarkets.find(m => 
    m.base_symbol.toUpperCase() === base.toUpperCase() && 
    m.quote_symbol.toUpperCase() === quote.toUpperCase()
  );

  let text = `📈 *Market Details: ${base} / ${quote}*\n\n`;
  if (market) {
    text += `• *Ticker Symbol:* ${market.symbol}\n`;
    text += `• *Base Asset:* ${market.base_symbol} (\`${market.base_address.substring(0, 6)}...${market.base_address.substring(38)}\`)\n`;
    text += `• *Quote Asset:* ${market.quote_symbol} (\`${market.quote_address.substring(0, 6)}...${market.quote_address.substring(38)}\`)\n`;
    text += `• *Quantity Precision:* ${market.quantity_precision}\n`;
    text += `• *Tick Precision:* ${market.tick_precision}\n`;
    text += `• *Minimum Ask:* ${market.min_ask_amount} ${market.base_symbol}\n`;
    text += `• *Minimum Bid:* ${market.min_bid_quote_amount} ${market.quote_symbol}\n`;
  } else {
    text += `• *Pair:* ${base} → ${quote}\n`;
  }

  const filterStr = filter || "";
  const keyboard = new InlineKeyboard()
    .text("💸 Get Quote", `q_flow:${base}:${quote}`)
    .text("🔔 Set Alert", `al_flow:${base}:${quote}`).row()
    .text("⬅ Back to List", `mkt:${backPage}:${filterStr.substring(0, 10)}`)
    .text("🏠 Home", "home");

  return { text, keyboard };
}

function getQuoteFlow(from: string, to: string) {
  const text = `💸 *Sera Swap Quote: ${from} ➔ ${to}*\n\n` +
    `Select a predefined swap amount below, or click *✏️ Custom Amount* to specify another value:`;
  const keyboard = new InlineKeyboard()
    .text("100", `q_amt:${from}:${to}:100`)
    .text("1,000", `q_amt:${from}:${to}:1000`)
    .text("10,000", `q_amt:${from}:${to}:10000`).row()
    .text("✏️ Custom Amount", `q_custom:${from}:${to}`).row()
    .text("🏠 Home", "home");
  return { text, keyboard };
}

function getAlertFlow(from: string, to: string) {
  const text = `🔔 *Create Alert for ${from} ➔ ${to}*\n\n` +
    `Choose when you want to be notified:`;
  const keyboard = new InlineKeyboard()
    .text("📈 Rate Goes Above", `al_cond:${from}:${to}:above`)
    .text("📉 Rate Goes Below", `al_cond:${from}:${to}:below`).row()
    .text("🏠 Home", "home");
  return { text, keyboard };
}

function getAlertsPage(chatId: number, page: number) {
  const alerts = listAlertsForChat(chatId);
  const pageSize = 5;
  const totalAlerts = alerts.length;
  const totalPages = Math.ceil(totalAlerts / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * pageSize;
  const pageAlerts = alerts.slice(startIdx, startIdx + pageSize);

  let text = `🔔 *Active Quote Alerts*\n\n`;
  if (totalAlerts === 0) {
    text += `You have no active quote alerts. Create one from any market's detail view!`;
  } else {
    text += `Your active price alerts:\n\n`;
    for (let i = 0; i < pageAlerts.length; i++) {
      const a = pageAlerts[i];
      const condLabel = a.condition === "above" ? "Above" : "Below";
      const idx = startIdx + i + 1;
      text += `*${idx}.* ${a.from_token} ➔ ${a.to_token} when ${condLabel} *${a.target_rate.toFixed(4)}* (ID: ${a.id})\n`;
    }
  }

  const keyboard = new InlineKeyboard();
  if (pageAlerts.length > 0) {
    for (let i = 0; i < pageAlerts.length; i++) {
      const a = pageAlerts[i];
      const idx = startIdx + i + 1;
      keyboard.text(`❌ Remove ${idx}`, `rm_al:${a.id}:${currentPage}`);
    }
    keyboard.row();
  }

  if (currentPage > 1 || currentPage < totalPages) {
    if (currentPage > 1) {
      keyboard.text("⬅ Prev", `alerts:${currentPage - 1}`);
    }
    if (currentPage < totalPages) {
      keyboard.text("➡ Next", `alerts:${currentPage + 1}`);
    }
    keyboard.row();
  }

  keyboard.text("🏠 Home", "home");

  return { text, keyboard };
}

async function getTrendingPage(page: number) {
  const markets = await getCachedMarkets();
  const counts: Record<string, { symbol: string; count: number }> = {};
  for (const m of markets) {
    if (!counts[m.base_address.toLowerCase()]) {
      counts[m.base_address.toLowerCase()] = { symbol: m.base_symbol, count: 0 };
    }
    counts[m.base_address.toLowerCase()].count++;

    if (!counts[m.quote_address.toLowerCase()]) {
      counts[m.quote_address.toLowerCase()] = { symbol: m.quote_symbol, count: 0 };
    }
    counts[m.quote_address.toLowerCase()].count++;
  }

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);

  const pageSize = 5;
  const totalTokens = sorted.length;
  const totalPages = Math.ceil(totalTokens / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * pageSize;
  const pageTokens = sorted.slice(startIdx, startIdx + pageSize);

  let text = `🔥 *Trending Connected Tokens*\n\n` +
    `These tokens appear in the most active Sera markets. Click on a token below to view all its matching markets:\n\n`;

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < pageTokens.length; i++) {
    const entry = pageTokens[i];
    const idx = startIdx + i + 1;
    text += `${idx}. *${entry.symbol}* (${entry.count} markets)\n`;
    keyboard.text(entry.symbol, `mkt:1:${entry.symbol}`);
  }
  keyboard.row();

  if (currentPage > 1 || currentPage < totalPages) {
    if (currentPage > 1) {
      keyboard.text("⬅ Prev", `trd:${currentPage - 1}`);
    }
    if (currentPage < totalPages) {
      keyboard.text("➡ Next", `trd:${currentPage + 1}`);
    }
    keyboard.row();
  }

  keyboard.text("🏠 Home", "home");

  return { text, keyboard };
}

async function getStatsView() {
  const markets = await getCachedMarkets();
  const tokens = await getTokens();

  const totalMarkets = markets.length;
  const totalTokens = tokens.length;

  const lastRefreshTs = getMarketsCacheTimestamp();
  const lastRefreshText = lastRefreshTs 
    ? new Date(lastRefreshTs).toISOString().replace("T", " ").substring(0, 19) + " UTC"
    : "Just now";

  const quoteCounts: Record<string, number> = {};
  for (const m of markets) {
    quoteCounts[m.quote_symbol] = (quoteCounts[m.quote_symbol] || 0) + 1;
  }
  const usdtCount = quoteCounts["USDT"] || 0;
  const usdcCount = quoteCounts["USDC"] || 0;
  const eursCount = quoteCounts["EURS"] || 0;

  let text = `📊 *Sera Market Stats*\n\n` +
    `• Total Active Markets: ${totalMarkets}\n` +
    `• Total Tokens: ${totalTokens}\n` +
    `• Last Refresh: ${lastRefreshText}\n\n` +
    `*Most Common Quote Tokens:*\n\n` +
    `• USDT: ${usdtCount} markets\n` +
    `• USDC: ${usdcCount} markets\n` +
    `• EURS: ${eursCount} markets\n`;

  const keyboard = new InlineKeyboard().text("🏠 Home", "home");

  return { text, keyboard };
}

async function getDiscoverView() {
  const markets = await getCachedMarkets();
  const totalMarkets = markets.length;

  const counts: Record<string, { symbol: string; count: number }> = {};
  for (const m of markets) {
    counts[m.base_address.toLowerCase()] = counts[m.base_address.toLowerCase()] || { symbol: m.base_symbol, count: 0 };
    counts[m.base_address.toLowerCase()].count++;

    counts[m.quote_address.toLowerCase()] = counts[m.quote_address.toLowerCase()] || { symbol: m.quote_symbol, count: 0 };
    counts[m.quote_address.toLowerCase()].count++;
  }
  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
  const topToken = sorted[0];

  const newest = getNewestMarket();
  const newestMarketText = newest ? `${newest.symbol} (${newest.discoveredAt})` : "None recently";

  let text = `💡 *Sera Protocol Discovery Insights*\n\n` +
    `• *Total Active Markets:* ${totalMarkets}\n` +
    `• *Most Connected Token:* *${topToken?.symbol || "N/A"}* (appears in ${topToken?.count || 0} markets)\n` +
    `• *Newest Listed Market:* ${newestMarketText}\n\n` +
    `*Suggested Commands:*\n` +
    `• \`/pair USDC USDT\` - Look up token pair details\n` +
    `• \`/compare USDC EURS\` - Compare token dominance\n` +
    `• \`/trending\` - View most active tokens`;

  const keyboard = new InlineKeyboard().text("🏠 Home", "home");
  return { text, keyboard };
}

async function fetchAndFormatQuote(fromSym: string, toSym: string, amountStr: string): Promise<string> {
  const tokens = await getTokens();
  const fromToken = tokens.find(t => t.symbol.toUpperCase() === fromSym.toUpperCase());
  const toToken = tokens.find(t => t.symbol.toUpperCase() === toSym.toUpperCase());

  if (!fromToken) {
    throw new Error(`Unsupported source token symbol: *${fromSym}*`);
  }
  if (!toToken) {
    throw new Error(`Unsupported destination token symbol: *${toSym}*`);
  }

  let atomicAmount: string;
  try {
    atomicAmount = parseUnits(amountStr, fromToken.decimals);
  } catch (e) {
    throw new Error(`Invalid amount *${amountStr}*. Please specify a valid number.`);
  }

  const quote = await getQuote({
    from_token: fromToken.address,
    to_token: toToken.address,
    from_amount: atomicAmount,
    owner_address: "0x0000000000000000000000000000000000000000",
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
  return text;
}

async function editOrReply(ctx: any, text: string, keyboard: InlineKeyboard) {
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes("message is not modified")) {
        return;
      }
      console.warn("editMessageText failed, falling back to reply:", error);
    }
  }
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

// ==========================================
// Bot Commands
// ==========================================

// /start command
bot.command("start", async (ctx) => {
  const { text, keyboard } = getMainMenu();
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

// /about command
bot.command("about", async (ctx) => {
  const text = `*Sera Scout*\n\n` +
    `Telegram companion bot for the Sera Protocol, focused on market discovery, quote generation, and price intelligence.\n\n` +
    `• *Quote Generation*: Fetch real-time, slippage-protected swap quotes directly from Sera Mainnet.\n` +
    `• *Market Discovery*: Discover trading pairs using /markets and trending tokens via /trending.\n` +
    `• *Intelligence Layer*: Gain insights on token connectivity and routes via /discover, /pair, and /compare.\n` +
    `• *Price Alerts & Digests*: Setup real-time rate alerts via /alert and daily digest summaries via /digest.`;
  const keyboard = new InlineKeyboard().text("🏠 Home", "home");
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

// /discover command
bot.command("discover", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const { text, keyboard } = await getDiscoverView();
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Bot /discover command error:", error);
    await ctx.reply("⚠️ Failed to load protocol discovery insights. Please try again later.");
  }
});

// /pair <base> <quote> command
bot.command("pair", async (ctx) => {
  try {
    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length !== 2) {
      await ctx.reply("⚠️ Usage: `/pair <base_symbol> <quote_symbol>`\nExample: `/pair USDC USDT`", { parse_mode: "Markdown" });
      return;
    }

    const [baseSym, quoteSym] = args.map(a => a.toUpperCase());
    await ctx.replyWithChatAction("typing").catch(() => {});

    const markets = await getCachedMarkets();
    const tokens = await getTokens();

    const directMarket = markets.find(m => 
      (m.base_symbol.toUpperCase() === baseSym && m.quote_symbol.toUpperCase() === quoteSym) ||
      (m.base_symbol.toUpperCase() === quoteSym && m.quote_symbol.toUpperCase() === baseSym)
    );

    const baseToken = tokens.find(t => t.symbol.toUpperCase() === baseSym);
    const quoteToken = tokens.find(t => t.symbol.toUpperCase() === quoteSym);

    let text = `🔍 *Sera Pair Lookup: ${baseSym} / ${quoteSym}*\n\n`;

    if (directMarket) {
      text += `✅ *Market Status:* Direct trading pair exists!\n` +
        `• *Ticker:* ${directMarket.symbol}\n` +
        `• *Base Decimals:* ${directMarket.base_decimals}\n` +
        `• *Quote Decimals:* ${directMarket.quote_decimals}\n` +
        `• *Tick Precision:* ${directMarket.tick_precision}\n` +
        `• *Quantity Precision:* ${directMarket.quantity_precision}\n\n`;
    } else {
      text += `❌ *Market Status:* Direct trading pair does not exist.\n\n`;
    }

    if (baseToken) {
      text += `*${baseSym} Token Info:*\n` +
        `• *Decimals:* ${baseToken.decimals}\n` +
        `• *Currency:* ${baseToken.currency}\n` +
        `• *Min Trade:* ${baseToken.min_trade_amount}\n\n`;
    }

    if (quoteToken) {
      text += `*${quoteSym} Token Info:*\n` +
        `• *Decimals:* ${quoteToken.decimals}\n` +
        `• *Currency:* ${quoteToken.currency}\n` +
        `• *Min Trade:* ${quoteToken.min_trade_amount}\n\n`;
    }

    text += `*Suggested Commands:*\n`;
    if (directMarket) {
      text += `• \`/quote ${baseSym} ${quoteSym} 100\` - Get instant quote\n` +
        `• \`/alert ${baseSym} ${quoteSym} above 1.0\` - Setup rate alert\n`;
    } else {
      text += `• \`/compare ${baseSym} ${quoteSym}\` - Compare both tokens\n`;
    }

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });

  } catch (error) {
    console.error("Bot /pair command error:", error);
    await ctx.reply("⚠️ Failed to look up pair information.");
  }
});

// /compare <token1> <token2> command
bot.command("compare", async (ctx) => {
  try {
    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length !== 2) {
      await ctx.reply("⚠️ Usage: `/compare <token1> <token2>`\nExample: `/compare USDC EURS`", { parse_mode: "Markdown" });
      return;
    }

    const [t1Sym, t2Sym] = args.map(a => a.toUpperCase());
    await ctx.replyWithChatAction("typing").catch(() => {});

    const markets = await getCachedMarkets();
    const tokens = await getTokens();

    const t1Info = tokens.find(t => t.symbol.toUpperCase() === t1Sym);
    const t2Info = tokens.find(t => t.symbol.toUpperCase() === t2Sym);

    if (!t1Info || !t2Info) {
      await ctx.reply(`❌ Could not compare. Both tokens must be in registry. Supporting symbols: ${tokens.map(t => t.symbol).join(", ")}`);
      return;
    }

    const t1Markets = markets.filter(m => 
      m.base_address.toLowerCase() === t1Info.address.toLowerCase() ||
      m.quote_address.toLowerCase() === t1Info.address.toLowerCase()
    );
    const t2Markets = markets.filter(m => 
      m.base_address.toLowerCase() === t2Info.address.toLowerCase() ||
      m.quote_address.toLowerCase() === t2Info.address.toLowerCase()
    );

    const counts: Record<string, number> = {};
    for (const m of markets) {
      counts[m.base_address.toLowerCase()] = (counts[m.base_address.toLowerCase()] || 0) + 1;
      counts[m.quote_address.toLowerCase()] = (counts[m.quote_address.toLowerCase()] || 0) + 1;
    }
    const sortedAddrs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const t1Rank = sortedAddrs.indexOf(t1Info.address.toLowerCase()) + 1;
    const t2Rank = sortedAddrs.indexOf(t2Info.address.toLowerCase()) + 1;

    const t1Partners = t1Markets.map(m => 
      m.base_address.toLowerCase() === t1Info.address.toLowerCase() ? m.quote_symbol : m.base_symbol
    );
    const t2Partners = t2Markets.map(m => 
      m.base_address.toLowerCase() === t2Info.address.toLowerCase() ? m.quote_symbol : m.base_symbol
    );
    const commonPartners = t1Partners.filter(p => t2Partners.includes(p));

    let text = `📊 *Sera Token Comparison: ${t1Sym} vs ${t2Sym}*\n\n` +
      `*1. Market Dominance:*\n` +
      `• *${t1Sym}*: ${t1Markets.length} markets (Rank #${t1Rank || "N/A"})\n` +
      `• *${t2Sym}*: ${t2Markets.length} markets (Rank #${t2Rank || "N/A"})\n\n` +
      `*2. Relative Connectivity:*\n`;

    if (t1Markets.length > t2Markets.length) {
      const multiplier = (t1Markets.length / (t2Markets.length || 1)).toFixed(1);
      text += `• ${t1Sym} is active in *${multiplier}x* more markets than ${t2Sym}.\n\n`;
    } else if (t2Markets.length > t1Markets.length) {
      const multiplier = (t2Markets.length / (t1Markets.length || 1)).toFixed(1);
      text += `• ${t2Sym} is active in *${multiplier}x* more markets than ${t1Sym}.\n\n`;
    } else {
      text += `• Both tokens have equal market connectivity.\n\n`;
    }

    text += `*3. Common Quote/Route Targets:*\n` +
      `• Shared Partners: ${commonPartners.length > 0 ? commonPartners.join(", ") : "None"}\n\n` +
      `💡 _Use /pair to analyze specific market characteristics of a trading pair._`;

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });

  } catch (error) {
    console.error("Bot /compare command error:", error);
    await ctx.reply("⚠️ Failed to compare tokens.");
  }
});

// /digest <on|off> command
bot.command("digest", async (ctx) => {
  try {
    const arg = ctx.match?.trim().toLowerCase();
    if (arg !== "on" && arg !== "off") {
      await ctx.reply("⚠️ Usage: \`/digest <on|off>\`\nExample: \`/digest on\`", { parse_mode: "Markdown" });
      return;
    }

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");

    if (arg === "on") {
      const success = subscribeDigest(ctx.chat.id);
      if (success) {
        await ctx.reply("🔔 *Daily Intelligence Digest Activated*\n\nYou will receive a summary of protocol activities and token insights every day around 9 AM UTC.", { parse_mode: "Markdown", reply_markup: keyboard });
      } else {
        await ctx.reply("ℹ️ You are already subscribed to the daily digest.", { parse_mode: "Markdown", reply_markup: keyboard });
      }
    } else {
      const success = unsubscribeDigest(ctx.chat.id);
      if (success) {
        await ctx.reply("🔕 *Daily Intelligence Digest Deactivated*\n\nYou will no longer receive daily summaries.", { parse_mode: "Markdown", reply_markup: keyboard });
      } else {
        await ctx.reply("ℹ️ You are not subscribed to the daily digest.", { parse_mode: "Markdown", reply_markup: keyboard });
      }
    }
  } catch (error) {
    console.error("Bot /digest error:", error);
    await ctx.reply("⚠️ Failed to update daily digest subscription.");
  }
});

// /alpha command
bot.command("alpha", async (ctx) => {
  try {
    const { board, lastUpdated } = getLatestAlphaBoard();

    if (!lastUpdated) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("🔄 Alpha Board is currently generating the first run. Please try again in a moment.", { reply_markup: keyboard });
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

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text.trim(), { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Bot /alpha handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  }
});

// /liquidity command
bot.command("liquidity", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    
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

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text.trim(), { parse_mode: "Markdown", reply_markup: keyboard });
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

    await ctx.replyWithChatAction("typing").catch(() => {});

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

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text.trim(), { parse_mode: "Markdown", reply_markup: keyboard });
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
    await ctx.replyWithChatAction("typing").catch(() => {});

    const text = await fetchAndFormatQuote(fromSym, toSym, amountStr);
    const keyboard = new InlineKeyboard()
      .text("🔄 Refresh", `q_amt:${fromSym.toUpperCase()}:${toSym.toUpperCase()}:${amountStr}`)
      .text("🔔 Set Alert", `al_flow:${fromSym.toUpperCase()}:${toSym.toUpperCase()}`).row()
      .text("🏠 Home", "home");

    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
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
    await ctx.replyWithChatAction("typing").catch(() => {});

    const { text, keyboard } = await getMarketsPage(1, filterArg);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
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

    await ctx.replyWithChatAction("typing").catch(() => {});

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
    const keyboard = new InlineKeyboard()
      .text("🔔 My Alerts", "alerts:1")
      .text("🏠 Home", "home");

    await ctx.reply(`✅ *Alert Created Successfully*\n\n` +
      `• *Pair:* ${alert.from_token} ➔ ${alert.to_token}\n` +
      `• *Trigger:* ${triggerLabel} ${alert.target_rate.toFixed(4)}\n` +
      `• *Alert ID:* ${alert.id}`, { parse_mode: "Markdown", reply_markup: keyboard });

  } catch (error) {
    console.error("Bot /alert error:", error);
    await ctx.reply("⚠️ Failed to create alert. Please try again.");
  }
});

// /myalerts command
bot.command("myalerts", async (ctx) => {
  try {
    const { text, keyboard } = getAlertsPage(ctx.chat.id, 1);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
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
    const keyboard = new InlineKeyboard()
      .text("🔔 My Alerts", "alerts:1")
      .text("🏠 Home", "home");

    if (success) {
      await ctx.reply(`✅ Alert ID *${alertId}* has been removed.`, { parse_mode: "Markdown", reply_markup: keyboard });
    } else {
      await ctx.reply(`❌ Failed to remove alert ID *${alertId}*.`, { parse_mode: "Markdown", reply_markup: keyboard });
    }
  } catch (error) {
    console.error("Bot /removealert error:", error);
    await ctx.reply("⚠️ Failed to remove alert.");
  }
});

// /watchnewmarkets command
bot.command("watchnewmarkets", async (ctx) => {
  try {
    const mode = ctx.match?.trim().toLowerCase();
    if (mode !== "on" && mode !== "off") {
      await ctx.reply("⚠️ Usage: \`/watchnewmarkets <on|off>\`\nExample: \`/watchnewmarkets on\`", { parse_mode: "Markdown" });
      return;
    }

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");

    if (mode === "on") {
      const success = subscribeChat(ctx.chat.id);
      if (success) {
        await ctx.reply("🔔 *New Market Watcher Activated*\n\nYou will receive notifications when new trading pairs are listed on Sera Protocol.", { parse_mode: "Markdown", reply_markup: keyboard });
      } else {
        await ctx.reply("ℹ️ You are already subscribed to new market notifications.", { parse_mode: "Markdown", reply_markup: keyboard });
      }
    } else {
      const success = unsubscribeChat(ctx.chat.id);
      if (success) {
        await ctx.reply("🔕 *New Market Watcher Deactivated*\n\nYou will no longer receive notifications for new markets.", { parse_mode: "Markdown", reply_markup: keyboard });
      } else {
        await ctx.reply("ℹ️ You are not subscribed to new market notifications.", { parse_mode: "Markdown", reply_markup: keyboard });
      }
    }
  } catch (error) {
    console.error("Bot /watchnewmarkets error:", error);
    await ctx.reply("⚠️ Failed to update watcher subscription.");
  }
});

// /stats command
bot.command("stats", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const { text, keyboard } = await getStatsView();
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Bot /stats error:", error);
    await ctx.reply("⚠️ Failed to load statistics.");
  }
});

// /token command
bot.command("token", async (ctx) => {
  try {
    const symbol = ctx.match?.trim();
    if (!symbol) {
      await ctx.reply("⚠️ Usage: \`/token <symbol>\`\nExample: \`/token USDC\`", { parse_mode: "Markdown" });
      return;
    }

    await ctx.replyWithChatAction("typing").catch(() => {});

    const tokens = await getTokens();
    const token = tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());

    if (!token) {
      await ctx.reply(`❌ Token "${symbol}" not found in registry.`, { parse_mode: "Markdown" });
      return;
    }

    const markets = await getCachedMarkets();
    const tokenMarkets = markets.filter(m => 
      m.base_address.toLowerCase() === token.address.toLowerCase() ||
      m.quote_address.toLowerCase() === token.address.toLowerCase()
    );
    const marketCount = tokenMarkets.length;

    let text = `🪙 *Token Information*\n\n` +
      `*Symbol:*\n${token.symbol}\n\n` +
      `*Address:*\n\`${token.address}\`\n\n` +
      `*Decimals:*\n${token.decimals}\n\n` +
      `*Currency:*\n${token.currency}\n\n` +
      `*Minimum Trade:*\n${token.min_trade_amount}\n\n` +
      `*Markets:*\n${marketCount} markets`;

    const keyboard = new InlineKeyboard().text("🏠 Home", "home");
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Bot /token error:", error);
    await ctx.reply("⚠️ Failed to load token information.");
  }
});

// /trending command
bot.command("trending", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const { text, keyboard } = await getTrendingPage(1);
    await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    console.error("Bot /trending error:", error);
    await ctx.reply("⚠️ Failed to load trending tokens.");
  }
});

// ==========================================
// Callback Query Handling
// ==========================================

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery().catch(() => {});

  const parts = data.split(":");
  const action = parts[0];

  try {
    if (action === "home") {
      const { text, keyboard } = getMainMenu();
      await editOrReply(ctx, text, keyboard);
    } else if (action === "menu_quote") {
      const { text, keyboard } = getQuoteMenu();
      await editOrReply(ctx, text, keyboard);
    } else if (action === "mkt") {
      const page = parseInt(parts[1] || "1", 10);
      const filter = parts[2] || "";
      const { text, keyboard } = await getMarketsPage(page, filter);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "mkt_det") {
      const base = parts[1];
      const quote = parts[2];
      const backPage = parseInt(parts[3] || "1", 10);
      const filter = parts[4] || "";
      const { text, keyboard } = await getMarketDetails(base, quote, backPage, filter);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "q_flow") {
      const from = parts[1];
      const to = parts[2];
      const { text, keyboard } = getQuoteFlow(from, to);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "q_custom") {
      const from = parts[1];
      const to = parts[2];
      
      userSessions.set(ctx.from.id, {
        state: "awaiting_quote_amount",
        pendingQuote: { from, to }
      });

      const text = `💸 *Sera Swap Quote: ${from} ➔ ${to}*\n\nPlease enter the swap amount (e.g. \`150.5\`):`;
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await editOrReply(ctx, text, keyboard);
    } else if (action === "q_custom_start") {
      userSessions.set(ctx.from.id, {
        state: "awaiting_quote_pair"
      });

      const text = `💸 *Sera Swap Quote*\n\nPlease enter the token swap pair (e.g. \`USDC USDT\`):`;
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await editOrReply(ctx, text, keyboard);
    } else if (action === "q_amt") {
      const from = parts[1];
      const to = parts[2];
      const amount = parts[3];
      
      await ctx.replyWithChatAction("typing").catch(() => {});
      
      try {
        const text = await fetchAndFormatQuote(from, to, amount);
        const keyboard = new InlineKeyboard()
          .text("🔄 Refresh", `q_amt:${from}:${to}:${amount}`)
          .text("🔔 Set Alert", `al_flow:${from}:${to}`).row()
          .text("🏠 Home", "home");
        await editOrReply(ctx, text, keyboard);
      } catch (err: any) {
        const msg = err.message || "Unknown error";
        const text = `❌ Failed to generate quote: *${msg}*`;
        const keyboard = new InlineKeyboard().text("🏠 Home", "home");
        await editOrReply(ctx, text, keyboard);
      }
    } else if (action === "al_flow") {
      const from = parts[1];
      const to = parts[2];
      const { text, keyboard } = getAlertFlow(from, to);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "al_cond") {
      const from = parts[1];
      const to = parts[2];
      const cond = parts[3] as "above" | "below";

      userSessions.set(ctx.from.id, {
        state: "awaiting_alert_rate",
        pendingAlert: { from, to, condition: cond }
      });

      const text = `🔔 *Create Alert for ${from} ➔ ${to}*\n\nPlease enter the target exchange rate (e.g. \`1.08\`):`;
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await editOrReply(ctx, text, keyboard);
    } else if (action === "alerts") {
      const page = parseInt(parts[1] || "1", 10);
      const { text, keyboard } = getAlertsPage(ctx.from.id, page);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "rm_al") {
      const id = parts[1];
      const page = parseInt(parts[2] || "1", 10);
      removeAlert(id);
      const { text, keyboard } = getAlertsPage(ctx.from.id, page);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "trd") {
      const page = parseInt(parts[1] || "1", 10);
      const { text, keyboard } = await getTrendingPage(page);
      await editOrReply(ctx, text, keyboard);
    } else if (action === "stats") {
      const { text, keyboard } = await getStatsView();
      await editOrReply(ctx, text, keyboard);
    } else if (action === "discover") {
      const { text, keyboard } = await getDiscoverView();
      await editOrReply(ctx, text, keyboard);
    }
  } catch (error) {
    console.error("Callback query error:", error);
    await ctx.reply("⚠️ An error occurred while processing your request. Please try again.").catch(() => {});
  }
});

// ==========================================
// Session Text Message Parsing
// ==========================================

bot.on("message:text", async (ctx, next) => {
  const session = userSessions.get(ctx.from.id);
  if (!session || session.state === "idle") {
    return next();
  }

  const text = ctx.message.text.trim();
  
  if (session.state === "awaiting_quote_pair") {
    userSessions.delete(ctx.from.id);

    const parts = text.split(/[\s/-]+/);
    if (parts.length < 2) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("❌ Invalid format. Please enter two token symbols separated by a space (e.g. `USDC USDT`).", { reply_markup: keyboard });
      return;
    }
    const from = parts[0].toUpperCase();
    const to = parts[1].toUpperCase();

    try {
      const tokens = await getTokens();
      const fromToken = tokens.find(t => t.symbol.toUpperCase() === from);
      const toToken = tokens.find(t => t.symbol.toUpperCase() === to);

      if (!fromToken || !toToken) {
        const keyboard = new InlineKeyboard().text("🏠 Home", "home");
        await ctx.reply(`❌ Unsupported token(s). Supported tokens: ${tokens.map(t => t.symbol).join(", ")}`, { reply_markup: keyboard });
        return;
      }

      const { text: flowText, keyboard } = getQuoteFlow(fromToken.symbol, toToken.symbol);
      await ctx.reply(flowText, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (err) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("⚠️ Failed to verify tokens. Please try again later.", { reply_markup: keyboard });
    }

  } else if (session.state === "awaiting_quote_amount") {
    userSessions.delete(ctx.from.id);

    const amount = Number(text);
    if (isNaN(amount) || amount <= 0) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("❌ Invalid amount. Must be a positive number.", { reply_markup: keyboard });
      return;
    }

    const { from, to } = session.pendingQuote!;
    await ctx.replyWithChatAction("typing").catch(() => {});

    try {
      const quoteText = await fetchAndFormatQuote(from, to, text);
      const keyboard = new InlineKeyboard()
        .text("🔄 Refresh", `q_amt:${from}:${to}:${text}`)
        .text("🔔 Set Alert", `al_flow:${from}:${to}`).row()
        .text("🏠 Home", "home");
      await ctx.reply(quoteText, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (err: any) {
      const msg = err.message || "Unknown error";
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply(`❌ Failed to generate quote: *${msg}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    }

  } else if (session.state === "awaiting_alert_rate") {
    userSessions.delete(ctx.from.id);

    const targetRate = Number(text);
    if (isNaN(targetRate) || targetRate <= 0) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("❌ Invalid rate. Must be a positive number.", { reply_markup: keyboard });
      return;
    }

    const { from, to, condition } = session.pendingAlert!;
    await ctx.replyWithChatAction("typing").catch(() => {});

    try {
      const tokens = await getTokens();
      const fromToken = tokens.find(t => t.symbol.toUpperCase() === from.toUpperCase());
      const toToken = tokens.find(t => t.symbol.toUpperCase() === to.toUpperCase());

      if (!fromToken || !toToken) {
        const keyboard = new InlineKeyboard().text("🏠 Home", "home");
        await ctx.reply("❌ Unsupported token pair for alert.", { reply_markup: keyboard });
        return;
      }

      const alert = addAlert({
        telegram_chat_id: ctx.chat.id,
        from_token: fromToken.symbol,
        from_address: fromToken.address,
        from_decimals: fromToken.decimals,
        to_token: toToken.symbol,
        to_address: toToken.address,
        to_decimals: toToken.decimals,
        condition: condition,
        target_rate: targetRate
      });

      const condLabel = condition === "above" ? "Above" : "Below";
      const replyText = `✅ *Alert Created Successfully*\n\n` +
        `• *Pair:* ${alert.from_token} ➔ ${alert.to_token}\n` +
        `• *Trigger:* ${condLabel} ${alert.target_rate.toFixed(4)}\n` +
        `• *Alert ID:* ${alert.id}`;
      
      const keyboard = new InlineKeyboard()
        .text("🔔 My Alerts", "alerts:1")
        .text("🏠 Home", "home");

      await ctx.reply(replyText, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (err) {
      const keyboard = new InlineKeyboard().text("🏠 Home", "home");
      await ctx.reply("⚠️ Failed to create alert. Please try again.", { reply_markup: keyboard });
    }
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
  startAlphaScheduler().catch((err) => {
    console.error("Failed to start Alpha Scheduler:", err);
  });

  // Start Grammy bot via long polling
  console.log("🚀 Bot is starting long polling...");
  
  // Start Quote Alert Scheduler
  startAlertScheduler(bot);

  // Start Market Discovery Scheduler (30m)
  startDiscoveryScheduler(bot);
  
  // Start Daily Digest Scheduler (hourly check)
  startDigestScheduler(bot);
  
  await bot.start();
}

start().catch((err) => {
  console.error("Failed to start Telegram Bot server:", err);
  process.exit(1);
});
