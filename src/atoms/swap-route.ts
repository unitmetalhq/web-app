import { atom } from "jotai";
import { type Address, type Hex } from "viem";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SwapRoute = {
  aggregator: string;
  /** Raw tokenOut units as a bigint string */
  amountOut: string;
  tx: { to: Address; data: Hex; value: string };
  approvalTarget: Address;
};

export type SwapRouteState = {
  /** The route the swap buttons will execute */
  selected: SwapRoute | null;
  /** All on-chain routes from zQuoter, sorted best-first */
  zfi: SwapRoute[];
};

// ── Atom ───────────────────────────────────────────────────────────────────────

export const swapRouteAtom = atom<SwapRouteState>({
  selected: null,
  zfi: [],
});
