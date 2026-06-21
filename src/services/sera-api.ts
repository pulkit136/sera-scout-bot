import type { 
  ApiTokenInfo, 
  ApiMarketInfo, 
  QuoteRequest, 
  ApiQuoteResponse 
} from "../api-types.js";

const API_BASE_URL = process.env.API_BASE_URL || "https://api.sera.cx/api/v1";

class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "RequestError";
  }
}

async function requestSeraApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const maxRetries = 3;
  const initialDelay = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (response.status === 429 && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[Sera REST API] Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        // Parse error details if available
        let errorMessage = `Sera API request failed: ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json() as any;
          if (errBody?.detail?.error) {
            errorMessage = errBody.detail.error;
          } else if (errBody?.detail) {
            errorMessage = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
          }
        } catch {}
        throw new RequestError(errorMessage, response.status);
      }

      return await response.json() as T;
    } catch (error) {
      const isClientError = error instanceof RequestError && error.status >= 400 && error.status < 500 && error.status !== 429;
      if (isClientError || attempt === maxRetries) {
        throw error;
      }
      const delay = initialDelay * Math.pow(2, attempt);
      console.warn(`[Sera REST API] Request failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

function normalizeApiMarket(market: ApiMarketInfo): ApiMarketInfo {
  if (!market) return market;
  return {
    ...market,
    base_symbol: market.base_symbol.toUpperCase() === "MYRC" ? "MYRT" : market.base_symbol,
    quote_symbol: market.quote_symbol.toUpperCase() === "MYRC" ? "MYRT" : market.quote_symbol,
    symbol: market.symbol.replace(/MYRC/gi, "MYRT")
  };
}

let marketsCache: { data: ApiMarketInfo[]; timestamp: number } | null = null;
const MARKETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getMarkets(): Promise<ApiMarketInfo[]> {
  const data = await requestSeraApi<{ markets: ApiMarketInfo[] }>("/markets");
  return data.markets.map(normalizeApiMarket);
}

export async function getCachedMarkets(bypassCache = false): Promise<ApiMarketInfo[]> {
  const now = Date.now();
  if (!bypassCache && marketsCache && (now - marketsCache.timestamp < MARKETS_CACHE_TTL)) {
    return marketsCache.data;
  }
  const markets = await getMarkets();
  marketsCache = { data: markets, timestamp: now };
  return markets;
}

export function getMarketsCacheTimestamp(): number | null {
  if (!marketsCache) return null;
  return marketsCache.timestamp;
}

let tokensCache: { data: ApiTokenInfo[]; timestamp: number } | null = null;
const TOKENS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getTokens(): Promise<ApiTokenInfo[]> {
  const now = Date.now();
  if (tokensCache && (now - tokensCache.timestamp < TOKENS_CACHE_TTL)) {
    return tokensCache.data;
  }
  const data = await requestSeraApi<{ tokens: ApiTokenInfo[] }>("/tokens");
  const tokens = data.tokens.map(token => ({
    ...token,
    symbol: token.symbol.toUpperCase() === "MYRC" ? "MYRT" : token.symbol
  }));
  tokensCache = { data: tokens, timestamp: now };
  return tokens;
}

export async function getQuote(request: QuoteRequest): Promise<ApiQuoteResponse> {
  return await requestSeraApi<ApiQuoteResponse>("/swap/quote", {
    method: "POST",
    body: JSON.stringify(request)
  });
}
