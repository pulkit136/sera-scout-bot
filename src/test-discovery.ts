import { subscribeChat, unsubscribeChat, getSubscribedChats, getKnownMarkets, setKnownMarkets } from "./services/discovery-storage.js";
import { getCachedMarkets, getTokens, getMarketsCacheTimestamp } from "./services/sera-api.js";
import { manualCheckNewMarkets } from "./services/discovery-scheduler.js";

const mockBot = {
  api: {
    sendMessage: async (chatId: number, text: string, options?: any) => {
      console.log(`\n📬 [Mock Bot Discovery notification] Chat ID: ${chatId}`);
      console.log(`----------------------------------------`);
      console.log(text);
      console.log(`----------------------------------------\n`);
      return {};
    }
  }
} as any;

async function runStats() {
  console.log(`\n========================================`);
  console.log(`🧪 Testing /stats command`);
  console.log(`========================================`);
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

  let text = `📊 *Sera Market Stats*\n\n`;
  text += `• Total Markets: ${totalMarkets}\n`;
  text += `• Total Tokens: ${totalTokens}\n`;
  text += `• Last Refresh: ${lastRefreshText}\n\n`;
  text += `*Most Common Quote Tokens:*\n\n`;
  text += `• USDT: ${usdtCount} markets\n`;
  text += `• USDC: ${usdcCount} markets\n`;
  text += `• EURS: ${eursCount} markets\n`;

  console.log(text);
}

async function runToken(symbol: string) {
  console.log(`\n========================================`);
  console.log(`🧪 Testing /token command for "${symbol}"`);
  console.log(`========================================`);
  const tokens = await getTokens();
  const token = tokens.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());

  if (!token) {
    console.log(`❌ Token "${symbol}" not found in registry.`);
    return;
  }

  const markets = await getCachedMarkets();
  const tokenMarkets = markets.filter(m => 
    m.base_address.toLowerCase() === token.address.toLowerCase() ||
    m.quote_address.toLowerCase() === token.address.toLowerCase()
  );
  const marketCount = tokenMarkets.length;

  let text = `🪙 *Token Information*\n\n`;
  text += `*Symbol:*\n${token.symbol}\n\n`;
  text += `*Address:*\n\`${token.address}\`\n\n`;
  text += `*Decimals:*\n${token.decimals}\n\n`;
  text += `*Currency:*\n${token.currency}\n\n`;
  text += `*Minimum Trade:*\n${token.min_trade_amount}\n\n`;
  text += `*Markets:*\n${marketCount} markets`;

  console.log(text);
}

async function runTrending() {
  console.log(`\n========================================`);
  console.log(`🧪 Testing /trending command`);
  console.log(`========================================`);
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

  let text = `🔥 *Most Connected Tokens*\n\n`;
  const limit = Math.min(sorted.length, 10);
  for (let i = 0; i < limit; i++) {
    const entry = sorted[i];
    text += `${i + 1}. *${entry.symbol}* (${entry.count} markets)\n`;
  }

  console.log(text);
}

async function testWatcher() {
  console.log(`\n========================================`);
  console.log(`🧪 Testing Market Watcher Subscription & Notification`);
  console.log(`========================================`);

  const chatId = 998877;
  
  // Clear any existing subscriptions/known markets
  unsubscribeChat(chatId);
  setKnownMarkets([]);
  console.log("✅ Subscriber cleared & known markets reset.");

  // 1. Subscribe chat
  const subResult = subscribeChat(chatId);
  console.log(`✅ Subscribed chat ${chatId}: ${subResult}`);
  console.log(`📋 Subscribed chats list:`, getSubscribedChats());

  // 2. Trigger check cycle to populate known markets (first run - no notifications)
  console.log("\n⏳ Running checkNewMarkets cycle (First load - populates known markets)...");
  await manualCheckNewMarkets(mockBot);
  console.log(`📋 Known markets populated. Count: ${getKnownMarkets().length}`);

  // 3. Mock a new market by removing it from the known list
  const known = getKnownMarkets();
  if (known.length > 0) {
    const removedSymbol = known[0];
    const modifiedKnown = known.slice(1);
    setKnownMarkets(modifiedKnown);
    console.log(`\n🕵️ Mocking new market: removed "${removedSymbol}" from known list.`);

    // 4. Trigger check cycle again (should detect it as new and send notification)
    console.log("⏳ Running checkNewMarkets cycle (Should detect the mock new market)...");
    await manualCheckNewMarkets(mockBot);
  }
}

async function main() {
  // Test watcher
  await testWatcher();

  // Test stats
  await runStats();

  // Test token explorer
  await runToken("USDC");
  await runToken("EURS");

  // Test trending tokens
  await runTrending();
}

main();
