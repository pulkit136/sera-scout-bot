import type { MarketInfo, OrderBook } from "../types.js";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmicv6kkbhyto01u3agb155hg/subgraphs/sera-pro/1.0.9/gn";

// ==========================================
// Concurrency Control Limiter
// ==========================================

class ConcurrencyLimiter {
  private max: number;
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(max: number) {
    this.max = max;
  }

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const limiter = new ConcurrencyLimiter(3); // Maximum 3 simultaneous GraphQL requests

// ==========================================
// GraphQL Query Definitions
// ==========================================

const GET_MARKET_QUERY = `
  query GetMarket($id: ID!) {
    market(id: $id) {
      id
      quoteToken { id symbol decimals }
      baseToken { id symbol decimals }
      quoteUnit
      makerFee
      takerFee
      minPrice
      tickSpace
      latestPrice
      latestPriceIndex
    }
  }
`;

const LIST_MARKETS_QUERY = `
  query ListMarkets($first: Int!) {
    markets(first: $first) {
      id
      quoteToken { id symbol decimals }
      baseToken { id symbol decimals }
      quoteUnit
      makerFee
      takerFee
      minPrice
      tickSpace
      latestPrice
      latestPriceIndex
    }
  }
`;

const GET_DEPTH_QUERY = `
  query GetDepth($market: String!, $first: Int!) {
    bids: depths(
      where: { market: $market, isBid: true, rawAmount_gt: "0" }
      orderBy: priceIndex
      orderDirection: desc
      first: $first
    ) {
      priceIndex
      price
      rawAmount
    }
    asks: depths(
      where: { market: $market, isBid: false, rawAmount_gt: "0" }
      orderBy: priceIndex
      orderDirection: asc
      first: $first
    ) {
      priceIndex
      price
      rawAmount
    }
  }
`;

// ==========================================
// GraphQL Request Helper
// ==========================================

async function querySubgraph<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  // Wrap execution in the concurrency limiter
  return limiter.run(async () => {
    const maxRetries = 3;
    const initialDelay = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables }),
        });

        if (response.status === 429 && attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`[Subgraph API] Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
        }

        const json = (await response.json()) as {
          data?: T;
          errors?: Array<{ message: string }>;
        };

        if (json.errors?.length) {
          throw new Error(`GraphQL Error: ${json.errors[0]?.message ?? "Unknown error"}`);
        }

        if (!json.data) {
          throw new Error("GraphQL response did not return a valid data object.");
        }

        return json.data;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[Subgraph API] Request failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Unreachable");
  });
}

// ==========================================
// Cache Implementation
// ==========================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 60000; // 60 seconds

let marketListCache: CacheEntry<MarketInfo[]> | null = null;
const depthCache = new Map<string, CacheEntry<OrderBook>>();

/**
 * Resets all in-memory caches.
 */
export function clearCache(): void {
  marketListCache = null;
  depthCache.clear();
}

// ==========================================
// Client Functions (Exported for Reuse)
// ==========================================

/**
 * Lists available trading markets in the protocol (bypassing cache).
 */
export async function listMarkets(limit: number = 10): Promise<MarketInfo[]> {
  const data = await querySubgraph<{ markets: MarketInfo[] }>(
    LIST_MARKETS_QUERY,
    { first: limit }
  );
  return data.markets;
}

/**
 * Retrieves detail metadata for a specific market address (bypassing cache).
 */
export async function getMarket(marketId: string): Promise<MarketInfo> {
  const data = await querySubgraph<{ market: MarketInfo | null }>(
    GET_MARKET_QUERY,
    { id: marketId.toLowerCase() }
  );

  if (!data.market) {
    throw new Error(`Market not found for address: ${marketId}`);
  }

  return data.market;
}

/**
 * Retrieves the order book bids and asks depth levels for a market (bypassing cache).
 */
export async function getDepth(marketId: string, limit: number = 10): Promise<OrderBook> {
  const data = await querySubgraph<OrderBook>(
    GET_DEPTH_QUERY,
    {
      market: marketId.toLowerCase(),
      first: limit,
    }
  );
  return data;
}

// ==========================================
// Cached Client Functions
// ==========================================

/**
 * Returns cached list of markets if valid, otherwise refetches.
 */
export async function getCachedMarkets(
  limit: number = 10,
  bypassCache = false
): Promise<MarketInfo[]> {
  const now = Date.now();

  if (!bypassCache && marketListCache && now - marketListCache.timestamp < CACHE_TTL) {
    return marketListCache.data.slice(0, limit);
  }

  // Pre-fetch 100 markets to populate the cache completely
  const data = await listMarkets(100);
  marketListCache = { data, timestamp: now };
  return data.slice(0, limit);
}

/**
 * Returns cached order book depth if valid, otherwise refetches.
 */
export async function getCachedDepth(
  marketId: string,
  limit: number = 10,
  bypassCache = false
): Promise<OrderBook> {
  const key = `${marketId.toLowerCase()}:${limit}`;
  const now = Date.now();
  const cached = depthCache.get(key);

  if (!bypassCache && cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await getDepth(marketId, limit);
  depthCache.set(key, { data, timestamp: now });
  return data;
}
