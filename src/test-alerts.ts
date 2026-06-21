import { Bot } from "grammy";
import { addAlert, listAlertsForChat, getAllAlerts, removeAlert } from "./services/alert-storage.js";
import { manualCheckAlerts } from "./services/alert-scheduler.js";
import { getTokens } from "./services/sera-api.js";

const mockBot = {
  api: {
    sendMessage: async (chatId: number, text: string, options?: any) => {
      console.log(`\n📬 [Mock Bot Notification] Chat ID: ${chatId}`);
      console.log(`----------------------------------------`);
      console.log(text);
      console.log(`----------------------------------------\n`);
      return {};
    }
  }
} as any;

async function main() {
  console.log("🧪 Testing Quote Alerts Integration...");

  try {
    // 1. Resolve token addresses
    const tokens = await getTokens();
    const usdc = tokens.find(t => t.symbol === "USDC");
    const usdt = tokens.find(t => t.symbol === "USDT");

    if (!usdc || !usdt) {
      throw new Error("Required tokens not found in registry");
    }

    // 2. Clear existing alerts if any to have a clean slate
    const existing = getAllAlerts();
    for (const a of existing) {
      removeAlert(a.id);
    }

    console.log("✅ Stored alerts cleared.");

    // 3. Create two alerts: one that triggers, one that doesn't
    // Alert 1: USDC -> USDT below 1.50 (Should trigger immediately since USDC/USDT is ~1.0)
    const alert1 = addAlert({
      telegram_chat_id: 11223344,
      from_token: "USDC",
      from_address: usdc.address,
      from_decimals: usdc.decimals,
      to_token: "USDT",
      to_address: usdt.address,
      to_decimals: usdt.decimals,
      condition: "below",
      target_rate: 1.50
    });
    console.log(`✅ Alert 1 created: ID ${alert1.id} (USDC -> USDT below 1.50)`);

    // Alert 2: USDC -> USDT above 2.00 (Should NOT trigger)
    const alert2 = addAlert({
      telegram_chat_id: 11223344,
      from_token: "USDC",
      from_address: usdc.address,
      from_decimals: usdc.decimals,
      to_token: "USDT",
      to_address: usdt.address,
      to_decimals: usdt.decimals,
      condition: "above",
      target_rate: 2.00
    });
    console.log(`✅ Alert 2 created: ID ${alert2.id} (USDC -> USDT above 2.00)`);

    // 4. List alerts
    const active = listAlertsForChat(11223344);
    console.log(`\n📋 Active alerts count for chat 11223344: ${active.length}`);
    active.forEach(a => {
      console.log(`   - ID ${a.id}: ${a.from_token} -> ${a.to_token} if ${a.condition} ${a.target_rate}`);
    });

    // 5. Run manual alert check (evaluates conditions and triggers Alert 1)
    console.log("\n⏳ Running checkAlerts cycle...");
    await manualCheckAlerts(mockBot);

    // 6. Verify Alert 1 was removed and Alert 2 remains
    const postCheckActive = listAlertsForChat(11223344);
    console.log(`\n📋 Active alerts count after check cycle: ${postCheckActive.length}`);
    postCheckActive.forEach(a => {
      console.log(`   - ID ${a.id}: ${a.from_token} -> ${a.to_token} if ${a.condition} ${a.target_rate}`);
    });

    // 7. Test manual removal of Alert 2
    if (postCheckActive.length > 0) {
      const removedId = postCheckActive[0].id;
      const removeSuccess = removeAlert(removedId);
      console.log(`\n🗑️ Removing Alert ID ${removedId}: ${removeSuccess ? "Success" : "Failed"}`);

      const finalActive = listAlertsForChat(11223344);
      console.log(`📋 Final active alerts count: ${finalActive.length}`);
    }

  } catch (err) {
    console.error("❌ Test failed:", err);
  }
}

main();
