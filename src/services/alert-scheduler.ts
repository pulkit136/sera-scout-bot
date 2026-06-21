import { Bot } from "grammy";
import { getAllAlerts, removeAlerts } from "./alert-storage.js";
import { getQuote } from "./sera-api.js";
import { parseUnits, formatUnits } from "../utils/decimal.js";

let schedulerInterval: NodeJS.Timeout | null = null;

async function checkAlerts(bot: Bot) {
  const alerts = getAllAlerts();
  if (alerts.length === 0) return;

  // Group alerts by unique swap pair (from_address + to_address)
  const groups: Record<string, typeof alerts> = {};
  for (const a of alerts) {
    const key = `${a.from_address.toLowerCase()}:${a.to_address.toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }

  const deactivatedIds: string[] = [];

  for (const key of Object.keys(groups)) {
    const groupAlerts = groups[key]!;
    const sample = groupAlerts[0]!;

    try {
      const fromAmountStr = "100"; // standard test amount
      const atomicAmount = parseUnits(fromAmountStr, sample.from_decimals);

      // Fetch quote
      const quote = await getQuote({
        from_token: sample.from_address,
        to_token: sample.to_address,
        from_amount: atomicAmount,
        owner_address: "0x0000000000000000000000000000000000000000",
        recipient: "0x0000000000000000000000000000000000000000",
        expiration: Math.floor(Date.now() / 1000) + 120,
        gas_mode: "receive_less"
      });

      const minReceive = quote.route_params.minOutputAmount;
      const receiveAmountStr = formatUnits(minReceive, sample.to_decimals);
      const gasCostFromToken = quote.fee_breakdown?.gas_cost_from_token || "0";

      const gasCostRaw = parseUnits(gasCostFromToken, sample.from_decimals);
      const netInputRaw = BigInt(atomicAmount) - BigInt(gasCostRaw);

      if (netInputRaw <= 0n) {
        console.warn(`[Alert Scheduler] Gas cost exceeds input amount for ${sample.from_token} -> ${sample.to_token}. Skipping.`);
        continue;
      }

      const netInputStr = formatUnits(netInputRaw.toString(), sample.from_decimals);
      const numericMinReceive = Number(receiveAmountStr);
      const numericNetInput = Number(netInputStr);
      const effectiveRate = numericMinReceive / numericNetInput;

      // Evaluate condition for each alert in the group
      for (const alert of groupAlerts) {
        let triggered = false;
        if (alert.condition === "above" && effectiveRate >= alert.target_rate) {
          triggered = true;
        } else if (alert.condition === "below" && effectiveRate <= alert.target_rate) {
          triggered = true;
        }

        if (triggered) {
          // Construct Telegram notification text
          const conditionLabel = alert.condition === "above" ? "Above" : "Below";
          const messageText = `🚨 *Quote Alert Triggered*\n\n` +
            `*Pair:*\n` +
            `${alert.from_token} → ${alert.to_token}\n\n` +
            `*Current Rate:*\n` +
            `${effectiveRate.toFixed(6)}\n\n` +
            `*Target:*\n` +
            `${conditionLabel} ${alert.target_rate.toFixed(4)}\n\n` +
            `*Alert ID:*\n` +
            `${alert.id}`;

          // Send message via Telegram API
          bot.api.sendMessage(alert.telegram_chat_id, messageText, { parse_mode: "Markdown" })
            .catch(sendErr => {
              console.error(`[Alert Scheduler] Failed to send Telegram notification to chat ${alert.telegram_chat_id}:`, sendErr);
            });

          deactivatedIds.push(alert.id);
        }
      }

    } catch (apiError) {
      console.warn(`[Alert Scheduler] Quote check failed for ${sample.from_token} -> ${sample.to_token}:`, 
        apiError instanceof Error ? apiError.message : apiError
      );
    }
  }

  // Deactivate/remove triggered alerts
  if (deactivatedIds.length > 0) {
    removeAlerts(deactivatedIds);
    console.log(`[Alert Scheduler] Deactivated triggered alert IDs: ${deactivatedIds.join(", ")}`);
  }
}

export function startAlertScheduler(bot: Bot) {
  if (schedulerInterval) return;

  console.log("⏰ Starting background Quote Alert Scheduler (60s)...");
  schedulerInterval = setInterval(() => {
    checkAlerts(bot).catch(err => {
      console.error("[Alert Scheduler] Error in check cycle:", err);
    });
  }, 60000);
}

// Export for manual testing
export async function manualCheckAlerts(bot: Bot) {
  await checkAlerts(bot);
}
