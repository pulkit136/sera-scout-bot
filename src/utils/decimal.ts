/**
 * Decimal-safe conversions similar to ethers parseUnits and formatUnits.
 */

export function parseUnits(amountStr: string, decimals: number): string {
  const cleanAmount = amountStr.trim();
  if (!cleanAmount || isNaN(Number(cleanAmount))) {
    throw new Error(`Invalid amount string: ${amountStr}`);
  }

  const parts = cleanAmount.split(".");
  const integerPart = parts[0] || "0";
  let fractionalPart = parts[1] || "";

  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.slice(0, decimals);
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, "0");
  }

  // Handle negative amounts if any (though typically not needed here)
  const isNegative = integerPart.startsWith("-");
  const absInteger = isNegative ? integerPart.slice(1) : integerPart;

  const combinedStr = absInteger + fractionalPart;
  const combinedVal = BigInt(combinedStr);

  return (isNegative ? "-" : "") + combinedVal.toString();
}

export function formatUnits(amountStr: string, decimals: number): string {
  const isNegative = amountStr.startsWith("-");
  const absAmount = isNegative ? amountStr.slice(1) : amountStr;

  const padded = absAmount.padStart(decimals + 1, "0");
  const cutPoint = padded.length - decimals;
  const integerPart = padded.slice(0, cutPoint);
  let fractionalPart = padded.slice(cutPoint);

  // Trim trailing zeros
  fractionalPart = fractionalPart.replace(/0+$/, "");

  const resultInteger = isNegative ? "-" + integerPart : integerPart;

  if (fractionalPart.length === 0) {
    return resultInteger;
  }
  return `${resultInteger}.${fractionalPart}`;
}
