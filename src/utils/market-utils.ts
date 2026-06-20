import type { OrderBook, DepthLevel, MarketInfo } from "../types.js";

/**
 * Returns the highest bid (buy order) from the order book.
 * Bids are pre-sorted by the subgraph in descending price index order.
 */
export function getBestBid(orderBook: OrderBook): DepthLevel | null {
  if (!orderBook.bids || orderBook.bids.length === 0) {
    return null;
  }
  return orderBook.bids[0];
}

/**
 * Returns the lowest ask (sell order) from the order book.
 * Asks are pre-sorted by the subgraph in ascending price index order.
 */
export function getBestAsk(orderBook: OrderBook): DepthLevel | null {
  if (!orderBook.asks || orderBook.asks.length === 0) {
    return null;
  }
  return orderBook.asks[0];
}

/**
 * Calculates the absolute bid-ask spread and the spread percentage.
 * Formula:
 *   spread = bestAsk.price - bestBid.price
 *   percentage = (spread / bestBid.price) * 100
 */
export function calculateSpread(orderBook: OrderBook): {
  spread: bigint;
  percentage: number;
} | null {
  const bestBid = getBestBid(orderBook);
  const bestAsk = getBestAsk(orderBook);

  if (!bestBid || !bestAsk) {
    return null;
  }

  const bidPrice = BigInt(bestBid.price);
  const askPrice = BigInt(bestAsk.price);
  const spread = askPrice - bidPrice;

  const percentage = (Number(spread) / Number(bidPrice)) * 100;

  return {
    spread,
    percentage,
  };
}

/**
 * Returns the market pair string format (e.g., "MYRT/AUDD").
 */
export function formatMarketPair(market: MarketInfo): string {
  return `${market.baseToken.symbol}/${market.quoteToken.symbol}`;
}
