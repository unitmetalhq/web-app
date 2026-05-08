/**
 * Unitmetal swap-aggregator API client.
 *
 * Stateless request module — no React, no hooks. The component layer wires
 * `fetchSwapAgg` into TanStack Query (`useQuery` with `enabled: false`,
 * manual `refetch`) so the call only fires when the user clicks "Get Quotes".
 *
 * The aggregator endpoint is the off-chain fallback to the on-chain zFi
 * quoter: each source produces its own routes, and the UI shows every
 * returned route side-by-side. Only `amountOut` is compared across sources
 * to decide which route gets auto-selected.
 */
import { type Address, type Hex } from "viem";
import type { SwapAggRequest, SwapAggResult } from "@/types/swapagg";
import { type SwapRoute } from "@/atoms/swap-route";

// Server only registers `/swapagg/ethereum` today. Adding new chains here as
// the API expands keeps the component layer chain-agnostic.
const CHAIN_SLUG: Record<number, string> = {
  1: "ethereum",
};

export function isSwapAggSupported(chainId: number | null | undefined): boolean {
  return chainId != null && CHAIN_SLUG[chainId] !== undefined;
}

export type FetchSwapAggArgs = {
  chainId: number;
  /** ERC-20 address. Use the zero address for native ETH (server auto-translates). */
  tokenIn: string;
  tokenOut: string;
  /** Raw amount in tokenIn base units, as a decimal string (wei). */
  amountIn: string;
  /** Wallet that will sign and pay. */
  sender: string;
  /** Address that receives tokenOut. Usually the same as sender. */
  recipient: string;
  /** Slippage tolerance in basis points (10 = 0.1%). Server caps at 2000. */
  slippageBps: number;
};

/**
 * Fetch routes from `POST /swapagg/{chain}` and convert each entry into the
 * shared `SwapRoute` shape. The response contains a `routes` map keyed by
 * aggregator name (`kyberswap`, …); we flatten it into an array sorted by
 * `amountOut` desc so the first element is each source's best.
 *
 * Throws on non-2xx responses or unsupported chains. Callers should rely on
 * TanStack Query for retry/loading state.
 */
export async function fetchSwapAgg(args: FetchSwapAggArgs): Promise<SwapRoute[]> {
  const slug = CHAIN_SLUG[args.chainId];
  if (!slug) throw new Error(`swapagg: unsupported chain ${args.chainId}`);

  const body: SwapAggRequest = {
    tokenIn: args.tokenIn,
    tokenOut: args.tokenOut,
    amountIn: args.amountIn,
    sender: args.sender,
    recipient: args.recipient,
    slippageTolerance: args.slippageBps,
  };

  const res = await fetch(
    `${import.meta.env.VITE_UNITMETAL_API_URL}/swapagg/${slug}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`swapagg: ${res.status} ${res.statusText}`);
  }

  const result = (await res.json()) as SwapAggResult;
  const routes: SwapRoute[] = Object.values(result.routes ?? {})
    .filter((r) => {
      try {
        return BigInt(r.amountOut) > 0n;
      } catch {
        return false;
      }
    })
    .map((r) => ({
      aggregator: r.name,
      amountOut: r.amountOut,
      // KyberSwap and other aggregators use a single contract for both the
      // ERC-20 spender and the swap target, so approvalTarget == tx.to.
      tx: {
        to: r.routerAddress as Address,
        data: r.data as Hex,
        value: r.transactionValue,
      },
      approvalTarget: r.routerAddress as Address,
    }))
    .sort((a, b) => (BigInt(a.amountOut) > BigInt(b.amountOut) ? -1 : 1));

  return routes;
}
