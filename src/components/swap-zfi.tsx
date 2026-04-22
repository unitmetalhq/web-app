import { useEffect, useMemo } from "react";
import { useReadContract } from "wagmi";
import { useSetAtom } from "jotai";
import { type Address, parseUnits } from "viem";
import { ZQUOTER, ZROUTER, ETH_ADDRESS } from "@/lib/constants";
import { ZQUOTER_ABI } from "@/lib/abis/zquoter-abi";
import { swapRouteAtom } from "@/atoms/swap-route";

// ── useZfiQuery ────────────────────────────────────────────────────────────────
//
// A manually-triggered hook that fetches a swap quote from the zFi on-chain
// quoter contract (zQuoter) and writes the result into the shared swapRouteAtom.
//
// Architecture overview:
//   - The parent component (SwapForm) calls refetch() when the user clicks
//     "Get Quotes". The query is never triggered automatically (enabled: false).
//   - wagmi's useReadContract issues an eth_call to zQuoter.buildBestSwapViaETHMulticall,
//     which is a view function — it simulates the full swap execution on-chain and
//     returns ready-to-send multicall calldata along with the expected output amount.
//   - When the call resolves, a useEffect writes the result into swapRouteAtom so
//     any component that needs the quote (SwapRouteSelector, swap execution) can
//     read it without prop drilling.
//
// Why on-chain instead of an off-chain API?
//   zQuoter runs the routing logic directly on-chain as a view call. This means
//   the returned calldata is the actual transaction payload — no separate
//   quote-then-build step is needed. The result can be sent to zRouter as-is.
//
// Data flow:
//   user input (amountIn, tokenIn, tokenOut, slippage)
//     → useZfiQuery (eth_call to zQuoter)
//       → swapRouteAtom { zfi: [route], selected: route }
//         → SwapRouteSelector renders the route
//         → SwapForm reads selected.tx to execute the swap

export function useZfiQuery({
  amountIn,
  tokenInDecimals,
  tokenIn,
  tokenOut,
  slippage,
  recipient,
  chainId,
}: {
  /** Human-readable input amount string from the form (e.g. "1.5").
   *  Subscribed live from the form store so refetch() always uses the latest value. */
  amountIn: string;
  /** Decimal places of tokenIn, used to convert the human-readable amount to raw units. */
  tokenInDecimals: number;
  /** ERC-20 address of the sell token, or the zero address for native ETH. */
  tokenIn: string | undefined;
  /** ERC-20 address of the buy token, or the zero address for native ETH. */
  tokenOut: string | undefined;
  /** Slippage tolerance as a percentage string, e.g. "0.5" means 0.5%.
   *  Converted to basis points before being passed to the contract. */
  slippage: string;
  /** Wallet address that will receive the output tokens.
   *  Falls back to the zero address when no wallet is connected — the contract
   *  still quotes correctly, but the returned calldata would send tokens to the
   *  zero address. refetch() should only be enabled when recipient is defined. */
  recipient: Address | undefined;
  /** Chain ID to target. null when no chain is selected; coerced to undefined
   *  before being passed to wagmi (it does not accept null). */
  chainId: number | null;
}) {
  const setSwapRoute = useSetAtom(swapRouteAtom);

  // Use the recipient as both the payer and the output receiver.
  // Falls back to the zero address so the contract args are always valid even
  // before the wallet is connected (the query is disabled in that case anyway).
  const to = recipient ?? (ETH_ADDRESS as Address);

  // Convert the slippage percentage to basis points (1% = 100 bps).
  // Math.round prevents floating-point imprecision (e.g. 0.1% → 10 bps exactly).
  // Falls back to 50 bps (0.5%) if slippage is empty, zero, or unparseable.
  const slippageBps = BigInt(Math.round(parseFloat(slippage) * 100) || 50);

  // The deadline is the Unix timestamp after which the on-chain transaction will
  // revert. It is intentionally memoized with an empty dependency array so it is
  // computed only once per hook mount (i.e. once per SwapForm lifetime).
  //
  // Why this matters for wagmi's query key:
  //   useReadContract builds an internal cache key from all contract call args.
  //   If deadline were recomputed on every render (e.g. BigInt(Date.now()/1000 + N)),
  //   the cache key would change on every render. When refetch() fires, any
  //   intermediate re-render (e.g. isFetching flipping to true) would produce a
  //   new key, causing the in-flight observer to jump to the new key and orphan
  //   the pending call — so query.data would never update and the atom would
  //   never be written. Memoizing with [] guarantees the key is stable for the
  //   entire lifetime of the hook instance.
  //
  //   1 hour (3600 s) is used rather than a tighter window so the deadline does
  //   not expire during normal use. Cache freshness is controlled separately by
  //   staleTime below.
  const deadline = useMemo(() => BigInt(Math.floor(Date.now() / 1000) + 3600), []);

  // Parse the human-readable amountIn into raw token units (bigint).
  // If the value is empty, invalid, or zero, parsedAmountIn stays at 0n.
  // A zero amountIn is still passed to the contract — the call will succeed
  // but return 0 output, which the useEffect below handles by clearing the atom.
  let parsedAmountIn = 0n;
  try {
    const v = parseUnits(amountIn, tokenInDecimals);
    if (v > 0n) parsedAmountIn = v;
  } catch {
    // parseUnits throws on non-numeric input (e.g. partial entry like "1.").
    // Keep parsedAmountIn at 0n and let the contract call return a zero quote.
  }

  // Fall back to the zero address (native ETH sentinel in zFi) when no token is
  // selected. This keeps the contract args structurally valid at all times.
  const tokenInAddr = (tokenIn ?? ETH_ADDRESS) as Address;
  const tokenOutAddr = (tokenOut ?? ETH_ADDRESS) as Address;

  // ── On-chain quote via zQuoter ─────────────────────────────────────────────
  //
  // buildBestSwapViaETHMulticall is a view function on the zQuoter contract that:
  //   1. Evaluates all available AMM venues (V2, V3, V4, zAMM, Curve, etc.).
  //   2. Optionally routes through ETH as an intermediate hop (two-hop swap) if
  //      that yields a better output than a direct single-hop route.
  //   3. Applies the slippage tolerance to the expected output to produce a
  //      minimum acceptable output amount baked into the calldata.
  //   4. Returns ready-to-execute multicall calldata for zRouter, along with the
  //      winning single-hop quote (a), the winning two-hop quote (b), the raw
  //      call array, and the ETH value to attach to the transaction (msgValue).
  //
  // Arguments (positional, matching the ABI):
  //   recipient   — address receiving the output tokens
  //   refundTo    — address receiving any unspent ETH (same as recipient here)
  //   unwrapWETH  — false: do not auto-unwrap WETH to ETH on output
  //   tokenIn     — sell token address (zero address = native ETH)
  //   tokenOut    — buy token address (zero address = native ETH)
  //   amountIn    — raw input amount in tokenIn's smallest unit
  //   slippageBps — maximum acceptable slippage in basis points
  //   deadline    — Unix timestamp after which the transaction reverts
  //   reserved0   — reserved for future use, pass 0
  //   reserved1   — reserved for future use, pass 0
  //   ethAddress  — the zero address used internally as the ETH sentinel
  //
  // enabled: false — the query is never run automatically. The parent calls
  //   query.refetch() manually when the user clicks "Get Quotes". This prevents
  //   stale or partial-input quotes from firing on every keystroke.
  //
  // staleTime: 15_000 — cached result is considered fresh for 15 seconds.
  //   A subsequent refetch within that window returns the cached value instantly.
  //
  // retry: 1 — retry once on failure (e.g. transient RPC error) before surfacing
  //   isError to the UI.
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

  // ── Write quote result to swapRouteAtom ────────────────────────────────────
  //
  // Runs whenever query.data changes — i.e. after each refetch() completes.
  //
  // viem decodes named multi-output ABI functions as labeled tuples (positional
  // readonly arrays), not as plain objects. The return type of
  // buildBestSwapViaETHMulticall is:
  //   [a: Quote, b: Quote, calls: Call[], multicall: bytes, msgValue: uint256]
  //
  // Where:
  //   a         — best single-hop quote (direct tokenIn → tokenOut path)
  //   b         — best two-hop quote (tokenIn → ETH → tokenOut, or similar)
  //   calls     — individual call structs that make up the multicall (unused here)
  //   multicall — ABI-encoded calldata ready to send to zRouter
  //   msgValue  — ETH value (in wei) that must be attached when calling zRouter.
  //               Non-zero when tokenIn is native ETH; zero for ERC-20 inputs.
  //
  // Output selection:
  //   If b.amountOut > 0, the two-hop route produced a result, which the quoter
  //   already determined to be optimal (it would not populate b otherwise).
  //   Otherwise fall back to the single-hop result in a.amountOut.
  //
  // Why setSwapRoute is omitted from the dependency array:
  //   useSetAtom returns a stable dispatch function (referentially equal across
  //   renders), so listing it would make no practical difference. The eslint
  //   suppress is kept to silence the exhaustive-deps rule without adding noise.
  useEffect(() => {
    if (!query.data) return;

    const [a, b, , multicall, msgValue] = query.data;
    const out = b.amountOut > 0n ? b.amountOut : a.amountOut;

    if (out > 0n) {
      const route = {
        aggregator: "zFi",
        // Store as a decimal string to avoid bigint serialisation issues across
        // atom boundaries and when passed to formatUnits in the UI.
        amountOut: out.toString(),
        // The tx object is everything SwapForm needs to call sendTransaction —
        // no further transformation required before submitting to the wallet.
        tx: { to: ZROUTER as Address, data: multicall, value: msgValue.toString() },
        // zRouter is both the spender that needs ERC-20 allowance and the
        // contract that executes the swap.
        approvalTarget: ZROUTER as Address,
      };
      setSwapRoute({ zfi: [route], selected: route });
    } else {
      // The quoter returned zero output (e.g. no liquidity, amountIn was 0n,
      // or tokenIn === tokenOut). Clear the atom so the UI shows no route.
      setSwapRoute({ zfi: [], selected: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  // Expose only the controls the parent needs:
  //   refetch     — called by the "Get Quotes" button to trigger the eth_call
  //   isFetching  — drives the loading spinner and disables the button
  //   isError     — surfaces an error state in SwapRouteSelector
  return {
    refetch: query.refetch,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
