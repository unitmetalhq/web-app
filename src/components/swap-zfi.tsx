import { useEffect, useMemo } from "react";
import { useReadContract } from "wagmi";
import { useSetAtom } from "jotai";
import { type Address, parseUnits } from "viem";
import { ZQUOTER, ZROUTER, ETH_ADDRESS } from "@/lib/constants";
import { ZQUOTER_ABI } from "@/lib/abis/zquoter-abi";
import { swapRouteAtom } from "@/atoms/swap-route";

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useZfiQuery({
  amountIn,
  tokenInDecimals,
  tokenIn,
  tokenOut,
  slippage,
  recipient,
  chainId,
}: {
  /** Live amountIn string from the form store — always current when refetch fires */
  amountIn: string;
  tokenInDecimals: number;
  tokenIn: string | undefined;
  tokenOut: string | undefined;
  /** Percentage string, e.g. "0.5" = 0.5% */
  slippage: string;
  recipient: Address | undefined;
  chainId: number | null;
}) {
  const setSwapRoute = useSetAtom(swapRouteAtom);

  const to = recipient ?? (ETH_ADDRESS as Address);
  const slippageBps = BigInt(Math.round(parseFloat(slippage) * 100) || 50);

  // Computed once per hook instance so the query key stays stable during a fetch.
  // Any in-progress refetch runs on the same key regardless of intermediate re-renders
  // (e.g. isFetching flipping to true). staleTime handles cache freshness separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 3600), []);

  let parsedAmountIn = 0n;
  try {
    const v = parseUnits(amountIn, tokenInDecimals);
    if (v > 0n) parsedAmountIn = v;
  } catch {
    // keep 0n
  }

  const tokenInAddr = (tokenIn ?? ETH_ADDRESS) as Address;
  const tokenOutAddr = (tokenOut ?? ETH_ADDRESS) as Address;

  const query = useReadContract({
    address: ZQUOTER as Address,
    abi: ZQUOTER_ABI,
    functionName: "buildBestSwapViaETHMulticall",
    args: [
      to, to, false,
      tokenInAddr, tokenOutAddr,
      parsedAmountIn, slippageBps, deadline,
      0, 0, ETH_ADDRESS as Address,
    ],
    chainId: chainId ?? undefined,
    query: {
      enabled: false,
      staleTime: 15_000,
      retry: 1,
    },
  });

  // Write result to atom when data arrives
  useEffect(() => {
    if (!query.data) return;

    // viem decodes named multi-output functions as labeled tuples (positional arrays)
    // [a, b, calls, multicall, msgValue]
    const [a, b, , multicall, msgValue] = query.data;
    const out = b.amountOut > 0n ? b.amountOut : a.amountOut;

    if (out > 0n) {
      const route = {
        aggregator: "zFi",
        amountOut: out.toString(),
        tx: { to: ZROUTER as Address, data: multicall, value: msgValue.toString() },
        approvalTarget: ZROUTER as Address,
      };
      setSwapRoute({ zfi: [route], selected: route });
    } else {
      setSwapRoute({ zfi: [], selected: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return {
    refetch: query.refetch,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

