import { getCachedMarkets, getCachedDepth } from "./sera.js";
import {
  getBestBid,
  getBestAsk,
  calculateSpread,
  formatMarketPair,
} from "../utils/market-utils.js";

export interface AlphaBoardEntry {
  market: string;
  bestBid: number;
  bestAsk: number;
  spreadPct: number;
}

export interface MarketScanResult {
  marketName: string;
  latestPrice: number;
  makerFee: number;
  takerFee: number;
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches all markets, queries their best bid/ask in rate-limited batches,
 * and returns them ranked by smallest spread percentage first.
 * Measures execution time.
 */
export async function getAlphaBoard(
  limit: number = 10,
  bypassCache: boolean = false
): Promise<AlphaBoardEntry[]> {
  const startTime = performance.now();

  // Fetch up to 100 markets using cached/fresh loader
  const markets = await getCachedMarkets(100, bypassCache);

  const entries: AlphaBoardEntry[] = [];
  const batchSize = 5;
  const delayMs = 150;

  // Process markets in small batches to respect Goldsky Subgraph rate limits
  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (market) => {
        try {
          // Fetch depth level 1 from cached/fresh loader
          const depth = await getCachedDepth(market.id, 1, bypassCache);
          const bestBid = getBestBid(depth);
          const bestAsk = getBestAsk(depth);
          const spreadInfo = calculateSpread(depth);

          if (bestBid && bestAsk && spreadInfo) {
            const bidVal = Number(bestBid.price) / 1e18;
            const askVal = Number(bestAsk.price) / 1e18;

            entries.push({
              market: formatMarketPair(market),
              bestBid: bidVal,
              bestAsk: askVal,
              spreadPct: spreadInfo.percentage,
            });
          }
        } catch (error) {
          // Skip markets that fail to load
        }
      })
    );

    // Only introduce a sleep delay if we are bypassing cache (hitting subgraph directly)
    if (bypassCache && i + batchSize < markets.length) {
      await sleep(delayMs);
    }
  }

  // Sort ascending by spread percentage (smallest first)
  entries.sort((a, b) => a.spreadPct - b.spreadPct);

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);
  console.log(`Alpha Board generated in ${duration} ms`);

  return entries.slice(0, limit);
}

/**
 * Refreshes the Alpha Board by bypassing the in-memory cache completely.
 */
export async function refreshAlphaBoard(limit: number = 10): Promise<AlphaBoardEntry[]> {
  return getAlphaBoard(limit, true);
}

/**
 * Scans all markets to find matches for a given token symbol (e.g. "MYRT" or "AUDD").
 * Utilizes cached metadata and depths by default.
 */
export async function getMarketScan(
  symbol: string,
  bypassCache: boolean = false
): Promise<MarketScanResult[]> {
  const targetSymbol = symbol.toUpperCase();
  const markets = await getCachedMarkets(100, bypassCache);

  // Filter markets that feature the target token symbol
  const matchedMarkets = markets.filter(
    (m) =>
      m.baseToken.symbol.toUpperCase() === targetSymbol ||
      m.quoteToken.symbol.toUpperCase() === targetSymbol
  );

  const results: MarketScanResult[] = [];
  const batchSize = 5;
  const delayMs = 150;

  for (let i = 0; i < matchedMarkets.length; i += batchSize) {
    const batch = matchedMarkets.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (market) => {
        try {
          const depth = await getCachedDepth(market.id, 1, bypassCache);
          const bestBid = getBestBid(depth);
          const bestAsk = getBestAsk(depth);
          const spreadInfo = calculateSpread(depth);

          const bidVal = bestBid ? Number(bestBid.price) / 1e18 : null;
          const askVal = bestAsk ? Number(bestAsk.price) / 1e18 : null;
          const latestPriceVal = Number(market.latestPrice) / 1e18;

          results.push({
            marketName: formatMarketPair(market),
            latestPrice: latestPriceVal,
            makerFee: Number(market.makerFee),
            takerFee: Number(market.takerFee),
            bestBid: bidVal,
            bestAsk: askVal,
            spreadPct: spreadInfo ? spreadInfo.percentage : null,
          });
        } catch (error) {
          // Fallback to basic details if depth call fails
          results.push({
            marketName: formatMarketPair(market),
            latestPrice: Number(market.latestPrice) / 1e18,
            makerFee: Number(market.makerFee),
            takerFee: Number(market.takerFee),
            bestBid: null,
            bestAsk: null,
            spreadPct: null,
          });
        }
      })
    );

    if (bypassCache && i + batchSize < matchedMarkets.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

export interface LiquidityMarketEntry {
  market: string;
  spreadPct: number;
  totalLiquidity: number;
  liquidityScore: number;
}

/**
 * Calculates liquidity metrics (totalBidLiquidity, totalAskLiquidity, totalLiquidity)
 * using the top 5 bids and asks, and returns the top markets ranked by liquidity descending.
 */
export async function getTopLiquidityMarkets(
  limit: number = 10,
  bypassCache: boolean = false
): Promise<LiquidityMarketEntry[]> {
  // Fetch markets (cached or fresh)
  const markets = await getCachedMarkets(100, bypassCache);
  const entries: LiquidityMarketEntry[] = [];
  const batchSize = 5;
  const delayMs = 150;

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (market) => {
        try {
          // Fetch depth level 5 (top 5 bids, top 5 asks)
          const depth = await getCachedDepth(market.id, 5, bypassCache);
          const spreadInfo = calculateSpread(depth);
          const baseDecimals = Number(market.baseToken.decimals);

          // Compute bid liquidity: sum of rawAmount normalized by base decimals
          const totalBidLiquidity = (depth.bids || []).reduce(
            (sum, bid) => sum + Number(bid.rawAmount) / Math.pow(10, baseDecimals),
            0
          );

          // Compute ask liquidity: sum of rawAmount normalized by base decimals
          const totalAskLiquidity = (depth.asks || []).reduce(
            (sum, ask) => sum + Number(ask.rawAmount) / Math.pow(10, baseDecimals),
            0
          );

          const totalLiquidity = totalBidLiquidity + totalAskLiquidity;
          const liquidityScore = totalLiquidity;

          // Include markets that have some liquidity
          if (totalLiquidity > 0) {
            entries.push({
              market: formatMarketPair(market),
              spreadPct: spreadInfo ? spreadInfo.percentage : 0,
              totalLiquidity,
              liquidityScore,
            });
          }
        } catch (error) {
          // Skip markets that fail to load
        }
      })
    );

    if (bypassCache && i + batchSize < markets.length) {
      await sleep(delayMs);
    }
  }

  // Sort descending by total liquidity
  entries.sort((a, b) => b.totalLiquidity - a.totalLiquidity);

  return entries.slice(0, limit);
}

