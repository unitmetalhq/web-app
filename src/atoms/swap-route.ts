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
  /** All off-chain aggregator routes from /swapagg, sorted best-first */
  swapagg: SwapRoute[];
};

// ── Atom ───────────────────────────────────────────────────────────────────────

export const swapRouteAtom = atom<SwapRouteState>({
  selected: null,
  zfi: [],
  swapagg: [],
});

// ── Helpers ────────────────────────────────────────────────────────────────────

// Pick the route with the largest amountOut across every source. Compared as
// bigint so the full uint256 range is respected — Number would silently lose
// precision past 2^53.
export function pickBestRoute(
  state: Pick<SwapRouteState, "zfi" | "swapagg">,
): SwapRoute | null {
  const all = [...state.zfi, ...state.swapagg];
  if (all.length === 0) return null;
  return all.reduce((best, r) =>
    BigInt(r.amountOut) > BigInt(best.amountOut) ? r : best,
  );
}
