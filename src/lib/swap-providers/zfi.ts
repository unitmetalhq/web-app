import type { Address, Hex } from "viem";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.zfi.wei.is";

/** zFi uses address(0) for native ETH, not the EeeEeE sentinel */
export const ZFI_ETH = "0x0000000000000000000000000000000000000000" as const;

// ─── Request ──────────────────────────────────────────────────────────────────

export type ZfiQuoteParams = {
  /** ERC20 address or ZFI_ETH for native ETH */
  tokenIn: string;
  /** ERC20 address or ZFI_ETH for native ETH */
  tokenOut: string;
  /** Raw integer in tokenIn's smallest unit (bigint or string) */
  amount: bigint | string;
  /** Recipient address. Required for executable calldata. */
  to?: Address;
  /** Slippage in basis points. Default: 50 (0.5%) */
  slippage?: number;
  /** If true, `amount` is the desired output rather than input */
  exactOut?: boolean;
};

// ─── Response ─────────────────────────────────────────────────────────────────

export type ZfiRouteQuote = {
  source: string;
  amountOut: string;
};

export type ZfiTx = {
  to: Address;
  data: Hex;
  /** ETH value to attach (as a decimal string) */
  value: string;
};

export type ZfiBestRoute = {
  /** Expected output in tokenOut's raw units */
  expectedOutput: string;
  /** Winning venue name, e.g. "Uniswap V3", "Bebop" */
  source: string;
  isTwoHop: boolean;
  isSplit: boolean;
};

export type ZfiQuoteResponse = {
  bestRoute: ZfiBestRoute;
  /** Ready-to-send transaction. Present when `to` was supplied in the request. */
  tx: ZfiTx;
  /** All competing venue quotes, sorted best-first */
  allQuotes: ZfiRouteQuote[];
  /** Address to approve for ERC20 input tokens */
  approvalTarget: Address;
  /** Execution contract (same as tx.to in practice) */
  settlementAddress: Address;
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ZfiApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`zFi API error ${status}: ${message}`);
    this.name = "ZfiApiError";
    this.status = status;
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Fetch a swap quote from the zFi REST API.
 *
 * No API key required. Returns the best route across all on-chain and
 * off-chain venues (Uniswap V2/V3/V4, Curve, Bebop, Enso, Odos, etc.).
 *
 * @example
 * const quote = await fetchZfiQuote({
 *   tokenIn: ZFI_ETH,
 *   tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
 *   amount: parseEther("1"),
 *   to: "0xYourWallet",
 * });
 * // quote.tx is ready to send — no further encoding needed
 */
export async function fetchZfiQuote(
  params: ZfiQuoteParams,
): Promise<ZfiQuoteResponse> {
  const url = new URL("/quote", BASE_URL);

  url.searchParams.set("tokenIn", params.tokenIn);
  url.searchParams.set("tokenOut", params.tokenOut);
  url.searchParams.set("amount", params.amount.toString());

  if (params.to) url.searchParams.set("to", params.to);
  if (params.slippage !== undefined)
    url.searchParams.set("slippage", params.slippage.toString());
  if (params.exactOut) url.searchParams.set("exactOut", "true");

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ZfiApiError(res.status, text);
  }

  return res.json() as Promise<ZfiQuoteResponse>;
}
