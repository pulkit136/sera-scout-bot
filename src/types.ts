export interface TokenInfo {
  id: string;
  symbol: string;
  decimals: string;
}

export interface MarketInfo {
  id: string;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  quoteUnit: string;
  makerFee: string;
  takerFee: string;
  minPrice: string;
  tickSpace: string;
  latestPrice: string;
  latestPriceIndex?: string;
}

export interface DepthLevel {
  priceIndex: string;
  price: string;
  rawAmount: string;
}

export interface OrderBook {
  bids: DepthLevel[];
  asks: DepthLevel[];
}
