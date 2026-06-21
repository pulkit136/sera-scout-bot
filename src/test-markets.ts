import { getCachedMarkets } from "./services/sera-api.js";

async function runTest(filterArg?: string) {
  console.log(`\n========================================`);
  console.log(`🧪 Testing /markets command with filter: ${filterArg ? `"${filterArg}"` : "none"}`);
  console.log(`========================================`);

  try {
    const allMarkets = await getCachedMarkets();
    const sortedMarkets = [...allMarkets].sort((a, b) => a.symbol.localeCompare(b.symbol));

    if (!filterArg) {
      const displayLimit = Math.min(sortedMarkets.length, 20);
      const displayed = sortedMarkets.slice(0, displayLimit);

      let text = `📈 *Sera Markets*\n\n`;
      for (const m of displayed) {
        text += `• ${m.base_symbol} / ${m.quote_symbol}\n`;
      }
      text += `\nShowing ${displayLimit} of ${sortedMarkets.length} markets\n\n`;
      text += `Try:\n\`/markets USDC\``;

      console.log(text);
    } else {
      const searchStr = filterArg.toUpperCase();
      const filtered = sortedMarkets.filter(m => 
        m.symbol.toUpperCase().includes(searchStr) ||
        m.base_symbol.toUpperCase().includes(searchStr) ||
        m.quote_symbol.toUpperCase().includes(searchStr)
      );

      if (filtered.length === 0) {
        console.log(`❌ No markets found matching "${filterArg}"\n\nTry:\n\`/markets USDC\``);
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

      console.log(text);
    }
  } catch (error) {
    console.error("❌ Test failed:", error instanceof Error ? error.message : error);
  }
}

async function main() {
  // Test no filter
  await runTest();

  // Test USDC filter
  await runTest("USDC");

  // Test EUR filter
  await runTest("EUR");

  // Test non-existent filter
  await runTest("XYZ");
}

main();
