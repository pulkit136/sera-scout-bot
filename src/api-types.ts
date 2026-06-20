export interface ApiTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  currency: string;
  min_trade_amount_raw: string;
  min_trade_amount: string;
}

export interface ApiMarketInfo {
  symbol: string;
  base_address: string;
  quote_address: string;
  base_symbol: string;
  quote_symbol: string;
  tick_precision: number;
  quantity_precision: number;
  base_decimals: number;
  quote_decimals: number;
  min_ask_amount_raw: string;
  min_ask_amount: string;
  min_bid_quote_amount_raw: string;
  min_bid_quote_amount: string;
}

export interface QuoteRequest {
  from_token: string;
  to_token: string;
  from_amount: string;
  owner_address: string;
  recipient: string;
  expiration: number;
  gas_mode: "receive_less" | "pay_more";
}

export interface RouteParams {
  taker: string;
  inputToken: string;
  outputToken: string;
  maxInputAmount: string;
  minOutputAmount: string;
  recipient: string;
  initialDepositAmount: string;
  uuid: string;
  deadline: number;
}

export interface FeeBreakdown {
  gas_cost_usd: string;
  gas_cost_from_token: string;
}

export interface ApiQuoteResponse {
  uuid: string;
  route_params: RouteParams;
  fee_breakdown?: FeeBreakdown;
  expires_at: number;
  route_metadata: {
    leg_count: number;
  };
}
