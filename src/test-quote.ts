import { getTokens, getQuote } from "./services/sera-api.js";
import { parseUnits, formatUnits } from "./utils/decimal.js";

async function main() {
  const fromSym = "USDC";
  const toSym = "USDT";
  const amountStr = "100";

  console.log(`🤖 Starting quote test for ${amountStr} ${fromSym} -> ${toSym}...`);

  try {
    // 1. Fetch tokens
    const tokens = await getTokens();
    const fromToken = tokens.find(t => t.symbol.toUpperCase() === fromSym.toUpperCase());
    const toToken = tokens.find(t => t.symbol.toUpperCase() === toSym.toUpperCase());

    if (!fromToken || !toToken) {
      throw new Error(`Token ${fromSym} or ${toSym} not found in token registry`);
    }

    console.log(`✅ Token addresses resolved:`);
    console.log(`   - ${fromSym}: ${fromToken.address} (${fromToken.decimals} decimals)`);
    console.log(`   - ${toSym}: ${toToken.address} (${toToken.decimals} decimals)`);

    // 2. Safe parse amount to atomic unit
    const atomicAmount = parseUnits(amountStr, fromToken.decimals);
    console.log(`✅ Safe amount conversion: "${amountStr}" -> "${atomicAmount}"`);

    // 3. Query quote endpoint
    console.log(`⏳ Requesting quote from Sera REST API...`);
    const quote = await getQuote({
      from_token: fromToken.address,
      to_token: toToken.address,
      from_amount: atomicAmount,
      owner_address: "0x0000000000000000000000000000000000000000",
      recipient: "0x0000000000000000000000000000000000000000",
      expiration: Math.floor(Date.now() / 1000) + 120,
      gas_mode: "receive_less"
    });

    console.log(`✅ Quote received!`);
    console.log(`   - Route ID: ${quote.uuid}`);
    console.log(`   - Min Output Raw: ${quote.route_params.minOutputAmount}`);

    // 4. Safe format output amount
    const receiveAmount = formatUnits(quote.route_params.minOutputAmount, toToken.decimals);
    console.log(`✅ Safe amount formatting: "${quote.route_params.minOutputAmount}" -> "${receiveAmount}"`);

    let text = `\n💸 Sera Swap Quote\n\n`;
    text += `• Input: ${amountStr} ${fromToken.symbol}\n`;

    if (quote.fee_breakdown && quote.fee_breakdown.gas_cost_from_token) {
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
    } else {
      text += `• Minimum Receive: ${receiveAmount} ${toToken.symbol}\n\n`;
    }

    text += `ℹ️ Minimum receive includes slippage protection.`;
    console.log(text);

  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : error);
  }
}

main();
