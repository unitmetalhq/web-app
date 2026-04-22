import type { Address, Hex } from "viem";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maps the on-chain AMM enum index to a human-readable name */
export const AMM_NAMES = [
  "V2", "SushiSwap", "zAMM", "V3", "V4",
  "Curve", "Lido", "WETH", "V4_HOOKED",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** Winning venue name */
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

/** On-chain Quote struct returned by zQuoter */
export type ZfiOnChainQuote = {
  source: number;
  feeBps: bigint;
  amountIn: bigint;
  amountOut: bigint;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get output amount from a buildBest result (single or two-hop) */
export function getBestOutput(a: ZfiOnChainQuote, b: ZfiOnChainQuote): bigint {
  return b.amountOut > 0n ? b.amountOut : a.amountOut;
}

/** Get output amount from a split/hybrid result (sum of both legs) */
export function getSplitOutput(legs: readonly [ZfiOnChainQuote, ZfiOnChainQuote]): bigint {
  return legs[0].amountOut + legs[1].amountOut;
}

/** Map the on-chain AMM enum index to a name */
export function getAmmName(source: number): string {
  return AMM_NAMES[source] ?? "Unknown";
}
