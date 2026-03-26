import { useState, useEffect, useRef } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useForm, useStore } from "@tanstack/react-form";
// import type { AnyFieldApi } from "@tanstack/react-form";
import {
  Loader2,
  Check,
  ArrowUpDown,
  Eraser,
  RefreshCcw,
  ChevronDown,
  Quote
} from "lucide-react";
import { type Address, erc20Abi, formatUnits, parseUnits, maxUint256 } from "viem";
import { fetchZfiQuote, ZFI_ETH, type ZfiQuoteResponse } from "@/lib/swap-providers/zfi";
import {
  useReadContract,
  useBalance,
  useConnection,
  useCapabilities,
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useEstimateGas,
  useGasPrice,
} from "wagmi";

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Kbd } from "@/components/ui/kbd";
import { TransactionStatus } from "@/components/transaction-status";


type TokenListToken = {
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
};

export default function SwapComponent() {
  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-md font-bold">Swap</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 py-2">
        <SwapForm />
      </div>
    </div>
  );
}

function SwapForm() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const connection = useConnection();

  const search = useSearch({ from: '/swap' });
  const navigate = useNavigate({ from: '/swap' });

  const { data: tokenList, isLoading: isLoadingTokens } = useQuery({
    queryKey: ["token-list"],
    queryFn: async () => {
      const res = await fetch("/token-list.json");
      if (!res.ok) throw new Error("Failed to fetch token list");
      return res.json() as Promise<{ tokens: TokenListToken[] }>;
    },
    staleTime: Infinity,
  });

  const effectiveChain = search.chain ?? connection.chain?.id ?? null;
  const tokens = effectiveChain
    ? (tokenList?.tokens.filter((t) => t.chainId === effectiveChain) ?? [])
    : [];

  const form = useForm({
    defaultValues: {
      tokenIn: search.from,
      tokenOut: search.to,
      amountIn: "",
      amountOut: "",
      route: null as AggregatorRoute | null,
    },
    onSubmit: async ({ value }) => {
      // TODO: integrate DEX aggregator (e.g. 0x, Uniswap Universal Router)
      console.log("swap", value);
    },
  });

  const tokenIn = useStore(form.store, (state) => state.values.tokenIn);
  const tokenOut = useStore(form.store, (state) => state.values.tokenOut);
  const amountIn = useStore(form.store, (state) => state.values.amountIn);
  const selectedRouteKey = useStore(form.store, (state) => {
    const r = state.values.route;
    return r ? `${r.aggregator}:${r.amountOut}` : null;
  });
  const debouncedAmountIn = useDebounce(amountIn, 500);

  const tokenInMeta = tokens.find((t) => t.address === tokenIn);
  const tokenInDecimals =
    tokenIn?.toLowerCase() === ETH_ADDRESS.toLowerCase()
      ? 18
      : (tokenInMeta?.decimals ?? 18);

  const tokenOutMeta = tokens.find((t) => t.address === tokenOut);
  const tokenOutDecimals =
    tokenOut?.toLowerCase() === ETH_ADDRESS.toLowerCase()
      ? 18
      : (tokenOutMeta?.decimals ?? 18);

  let parsedAmountIn: bigint | undefined;
  try {
    parsedAmountIn = debouncedAmountIn ? parseUnits(debouncedAmountIn, tokenInDecimals) : undefined;
  } catch {
    parsedAmountIn = undefined;
  }

  const zfiQuery = useQuery({
    queryKey: ["quote", "zfi", effectiveChain, tokenIn, tokenOut, debouncedAmountIn],
    queryFn: () =>
      fetchZfiQuote({
        tokenIn: tokenIn.toLowerCase() === ETH_ADDRESS.toLowerCase() ? ZFI_ETH : tokenIn,
        tokenOut: tokenOut.toLowerCase() === ETH_ADDRESS.toLowerCase() ? ZFI_ETH : tokenOut,
        amount: parsedAmountIn!,
        to: connection.address,
      }),
    enabled:
      effectiveChain === 1 &&
      !!tokenIn &&
      !!tokenOut &&
      parsedAmountIn !== undefined &&
      parsedAmountIn > 0n,
    staleTime: 15_000,
    retry: 1,
  });

  const rawAmountOut = zfiQuery.data?.bestRoute.expectedOutput;
  const formattedAmountOut = rawAmountOut
    ? formatUnits(BigInt(rawAmountOut), tokenOutDecimals)
    : "";

  const isDebouncing = amountIn !== debouncedAmountIn;
  const isLoadingQuote = !!amountIn && (isDebouncing || zfiQuery.isFetching);

  const isNativeTokenIn = tokenIn?.toLowerCase() === ETH_ADDRESS.toLowerCase();
  const approvalTarget = zfiQuery.data?.approvalTarget;

  const { data: capabilities } = useCapabilities();
  const supportsAtomicBatch =
    capabilities?.[connection.chain?.id ?? 0]?.atomicBatch?.supported ?? false;

  // ── Allowance ────────────────────────────────────────────────────────────
  const {
    data: currentAllowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useReadContract({
    address: tokenIn as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connection.address as Address, approvalTarget as Address],
    chainId: effectiveChain ?? undefined,
    query: {
      enabled:
        !isNativeTokenIn &&
        !!connection.address &&
        !!tokenIn &&
        !!approvalTarget,
    },
  });

  const isAllowanceSufficient =
    isNativeTokenIn ||
    (currentAllowance !== undefined &&
      parsedAmountIn !== undefined &&
      currentAllowance >= parsedAmountIn);

  const formattedAllowance =
    !isNativeTokenIn && currentAllowance !== undefined
      ? formatUnits(currentAllowance, tokenInDecimals)
      : null;

  // ── Approve ──────────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    isPending: isApprovePending,
    data: approveTxHash,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveConfirmed,
  } = useWaitForTransactionReceipt({ hash: approveTxHash });

  useEffect(() => {
    if (isApproveConfirmed) void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (!isNativeTokenIn && approvalTarget) void refetchAllowance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenIn, approvalTarget]);

  useEffect(() => {
    if (!isNativeTokenIn && approvalTarget) void refetchAllowance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteKey]);

  function handleApproveExact() {
    if (!approvalTarget || !parsedAmountIn) return;
    writeApprove({
      address: tokenIn as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [approvalTarget, parsedAmountIn],
      chainId: effectiveChain ?? undefined,
    });
  }

  function handleApproveUnlimited() {
    if (!approvalTarget) return;
    writeApprove({
      address: tokenIn as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [approvalTarget, maxUint256],
      chainId: effectiveChain ?? undefined,
    });
  }

  // ── Revoke ───────────────────────────────────────────────────────────────
  const {
    writeContract: writeRevoke,
    isPending: isRevokePending,
    data: revokeTxHash,
  } = useWriteContract();

  const { isLoading: isRevokeConfirming, isSuccess: isRevokeConfirmed } =
    useWaitForTransactionReceipt({ hash: revokeTxHash });

  useEffect(() => {
    if (isRevokeConfirmed) void refetchAllowance();
  }, [isRevokeConfirmed, refetchAllowance]);

  function handleRevoke() {
    if (!approvalTarget) return;
    writeRevoke({
      address: tokenIn as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [approvalTarget, 0n],
      chainId: effectiveChain ?? undefined,
    });
  }

  // ── Swap ─────────────────────────────────────────────────────────────────
  const {
    sendTransaction,
    isPending: isSwapPending,
    data: swapTxHash,
  } = useSendTransaction();

  const {
    isLoading: isSwapConfirming,
    isSuccess: isSwapConfirmed,
  } = useWaitForTransactionReceipt({ hash: swapTxHash });

  function handleSwap() {
    const tx = zfiQuery.data?.tx;
    if (!tx) return;
    sendTransaction({
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      chainId: effectiveChain ?? undefined,
    });
  }

  // ── Gas fee ──────────────────────────────────────────────────────────────
  const zfiTx = zfiQuery.data?.tx;

  const { data: gasEstimate } = useEstimateGas({
    to: zfiTx?.to,
    data: zfiTx?.data,
    value: zfiTx ? BigInt(zfiTx.value) : undefined,
    chainId: effectiveChain ?? undefined,
    query: { enabled: !!zfiTx && !!connection.address },
  });

  const { data: gasPrice } = useGasPrice({
    chainId: effectiveChain ?? undefined,
    query: { enabled: !!effectiveChain },
  });

  const gasFeeGwei =
    gasEstimate !== undefined && gasPrice !== undefined
      ? formatUnits(gasEstimate * gasPrice, 18)
      : null;

  // const {
  //   data: tokenInBalanceData,
  //   isLoading: isLoadingTokenInBalance,
  //   refetch: refetchTokenInBalance,
  // } = useReadContracts({
  //   contracts: [
  //     {
  //       address: tokenIn as Address,
  //       abi: erc20Abi,
  //       functionName: "balanceOf",
  //       args: [connection.address as Address],
  //       chainId: connection.chain?.id,
  //     },
  //   ],
  //   query: { enabled: isBalanceQueryEnabled && !!tokenIn },
  // });

  // const {
  //   data: tokenOutBalanceData,
  //   isLoading: isLoadingTokenOutBalance,
  // } = useReadContracts({
  //   contracts: [
  //     {
  //       address: tokenOut as Address,
  //       abi: erc20Abi,
  //       functionName: "balanceOf",
  //       args: [connection.address as Address],
  //       chainId: connection.chain?.id,
  //     },
  //   ],
  //   query: { enabled: isBalanceQueryEnabled && !!tokenOut },
  // });

  // const tokenInBalance = tokenInBalanceData?.[0]?.result as bigint | undefined;
  // const tokenOutBalance = tokenOutBalanceData?.[0]?.result as bigint | undefined;

  // let parsedAmountIn: bigint | undefined;
  // try {
  //   parsedAmountIn = amountIn ? parseUnits(amountIn, tokenInDecimals) : undefined;
  // } catch {
  //   parsedAmountIn = undefined;
  // }

  // const {
  //   data: swapTxHash,
  //   isPending: isPendingSwap,
  //   reset: resetSwap,
  // } = useWriteContract();

  // const {
  //   isLoading: isConfirmingSwap,
  //   isSuccess: isConfirmedSwap,
  // } = useWaitForTransactionReceipt({
  //   hash: swapTxHash,
  //   chainId: selectedChain || undefined,
  // });

  // const selectedChainBlockExplorer = config.chains.find(
  //   (chain) => chain.id.toString() === selectedChain?.toString()
  // )?.blockExplorers?.default.url;

  // function handleReset() {
  //   resetSwap();
  //   form.reset();
  // }

  function handleReset() {
    form.reset();
  }

  const handlersRef = useRef({
    handleReset,
    handleApproveExact,
    handleApproveUnlimited,
    handleRevoke,
    handleSwap,
    refetchQuote: () => void zfiQuery.refetch(),
    isSubmitting: () => form.state.isSubmitting,
  });
  useEffect(() => {
    handlersRef.current = {
      handleReset,
      handleApproveExact,
      handleApproveUnlimited,
      handleRevoke,
      handleSwap,
      refetchQuote: () => void zfiQuery.refetch(),
      isSubmitting: () => form.state.isSubmitting,
    };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const h = handlersRef.current;
      switch (e.key) {
        case "r":
          if (h.isSubmitting()) return;
          e.preventDefault();
          h.handleReset();
          break;
        case "q":
          e.preventDefault();
          h.refetchQuote();
          break;
        case "e":
          e.preventDefault();
          h.handleApproveExact();
          break;
        case "u":
          e.preventDefault();
          h.handleApproveUnlimited();
          break;
        case "v":
          e.preventDefault();
          h.handleRevoke();
          break;
        case "s":
          e.preventDefault();
          h.handleSwap();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleFlip() {
    const inVal = form.getFieldValue("tokenIn");
    const outVal = form.getFieldValue("tokenOut");
    form.setFieldValue("tokenIn", outVal);
    form.setFieldValue("tokenOut", inVal);
    form.setFieldValue("amountIn", "");
    navigate({ search: (prev) => ({ ...prev, from: outVal, to: inVal }) });
  }

  // useEffect(() => {
  //   resetSwap();
  //   form.reset();
  // }, [selectedChain, resetSwap, form]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        {/* ── From ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2 items-center justify-between">
            <p className="text-muted-foreground">From</p>
            <div className="flex flex-row gap-2">
              {(
                [
                  { label: "25%", num: BigInt(1), den: BigInt(4) },
                  { label: "50%", num: BigInt(1), den: BigInt(2) },
                  { label: "75%", num: BigInt(3), den: BigInt(4) },
                  { label: "Max", num: BigInt(1), den: BigInt(1) },
                ] as const
              ).map(({ label }) => (
                <button
                  key={label}
                  type="button"
                  className="text-xs hover:cursor-pointer underline underline-offset-4"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* amount + token picker row */}
          <div className="flex flex-row items-center justify-between gap-2">
            <form.Field name="amountIn">
              {(field) => (
                isDesktop ? (
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                    className="bg-transparent text-2xl outline-none flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    placeholder="0"
                    required
                  />
                ) : (
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                    className="bg-transparent text-2xl outline-none flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    placeholder="0"
                    required
                  />
                )
              )}
            </form.Field>
            <form.Field
              name="tokenIn"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Please select a token to sell" : undefined,
              }}
            >
              {(field) => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={field.state.value}
                  onSelect={(address) => {
                    field.handleChange(address);
                    navigate({ search: (prev) => ({ ...prev, from: address }) });
                  }}
                  disabledAddress={tokenOut}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          <TokenBalanceRow
            tokenAddress={tokenIn}
            tokens={tokens}
            chainId={effectiveChain}
            showRefresh
          />
        </div>

        {/* ── Flip ──────────────────────────────────────────────── */}
        <div className="flex flex-row items-center justify-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-none hover:cursor-pointer"
            onClick={handleFlip}
          >
            <ArrowUpDown />
          </Button>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ── To ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">To</p>

          {/* amount + token picker row */}
          <div className="flex flex-row items-center justify-between gap-2">
            {isLoadingQuote ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <input
                className="bg-transparent text-2xl outline-none flex-1 min-w-0 text-muted-foreground"
                type="text"
                placeholder="0"
                readOnly
                value={formattedAmountOut}
              />
            )}
            <form.Field name="tokenOut">
              {(field) => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={field.state.value}
                  onSelect={(address) => {
                    field.handleChange(address);
                    navigate({ search: (prev) => ({ ...prev, to: address }) });
                  }}
                  disabledAddress={tokenIn}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          <TokenBalanceRow
            tokenAddress={tokenOut}
            tokens={tokens}
            chainId={effectiveChain}
            showRefresh
          />
        </div>
        {/* ── Swap Info ───────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([isSubmitting]) => (
              <div className="flex flex-row items-center justify-between">
                <Button
                  className="hover:cursor-pointer rounded-none"
                  variant="outline"
                  type="button"
                  onClick={handleReset}
                  disabled={isSubmitting}
                >
                  <Eraser /> Reset <Kbd>R</Kbd>
                </Button>
                <Button
                  className="hover:cursor-pointer rounded-none"
                  variant="outline"
                  type="button"
                  onClick={() => void zfiQuery.refetch()}
                >
                  <Quote /> Get Quotes <Kbd>Q</Kbd>
                </Button>
              </div>
            )}
          </form.Subscribe>
          <RouteSelector zfiQuery={zfiQuery} onRouteChange={(route) => form.setFieldValue("route", route)} />
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Rate</p>
            <p>0%</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Gas fee</p>
            <p>{gasFeeGwei !== null ? `${gasFeeGwei} ETH` : "—"}</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Max slippage</p>
            <p>0.1%</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Fee</p>
            <p>Free</p>
          </div>
          {!isNativeTokenIn && (
            <div className="flex flex-row items-center justify-between text-xs">
              <p className="text-muted-foreground">Approval</p>
              <div className="flex flex-row items-center gap-2">
                {isLoadingAllowance ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <p>{formattedAllowance ?? "—"}</p>
                )}
                {currentAllowance !== undefined && currentAllowance > 0n && (
                  <Button
                    type="button"
                    size="xs"
                    onClick={handleRevoke}
                    disabled={isRevokePending || isRevokeConfirming || isRevokeConfirmed}
                    className="h-auto rounded-none px-1.5 py-0.5 text-xs hover:cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isRevokePending || isRevokeConfirming ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isRevokeConfirmed ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <>Revoke <Kbd className="bg-destructive/10 text-destructive-foreground h-3.5 min-w-3.5 text-[10px]">V</Kbd></>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <form.Subscribe selector={(state) => [state.canSubmit]}>
            {([canSubmit]) => {
              const isApproving = isApprovePending || isApproveConfirming;
              const isSwapping = isSwapPending || isSwapConfirming;
              const canSwap =
                canSubmit &&
                !!zfiQuery.data &&
                isAllowanceSufficient &&
                !isSwapping;
              const canApprove = canSubmit && !!approvalTarget && !isApproving;

              if (isNativeTokenIn || supportsAtomicBatch) {
                return (
                  <Button
                    className="hover:cursor-pointer rounded-none w-full"
                    type="button"
                    onClick={handleSwap}
                    disabled={!canSwap}
                  >
                    {isSwapping && <Loader2 className="w-4 h-4 animate-spin" />}
                    Swap
                  </Button>
                );
              }

              return (
                <div className="flex flex-col gap-4">
                  {/* approve row */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-row items-center gap-4">
                      <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center ${isAllowanceSufficient ? "border-green-500 text-green-500" : "border-muted-foreground text-muted-foreground"}`}>
                        1
                      </span>
                      <Button
                        className="hover:cursor-pointer rounded-none flex-1"
                        variant="outline"
                        type="button"
                        onClick={handleApproveExact}
                        disabled={!canApprove || isAllowanceSufficient}
                      >
                        {isApproving && <Loader2 className="w-3 h-3 animate-spin" />}
                        Approve exact <Kbd>E</Kbd>
                      </Button>
                      <Button
                        className="hover:cursor-pointer rounded-none flex-1"
                        variant="outline"
                        type="button"
                        onClick={handleApproveUnlimited}
                        disabled={!canApprove}
                      >
                        Approve unlimited <Kbd>U</Kbd>
                      </Button>
                    </div>
                    {(isApprovePending || isApproveConfirming || isApproveConfirmed || !!approveTxHash) && (
                      <div className="ml-9">
                        <TransactionStatus
                          isPending={isApprovePending}
                          isConfirming={isApproveConfirming}
                          isConfirmed={isApproveConfirmed}
                          txHash={approveTxHash}
                          blockExplorerUrl={connection.chain?.blockExplorers?.default.url}
                        />
                      </div>
                    )}
                  </div>

                  {/* swap row */}
                  <div className="flex flex-row items-center gap-4">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center ${isAllowanceSufficient ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
                      2
                    </span>
                    <Button
                      className="hover:cursor-pointer rounded-none flex-1"
                      type="button"
                      onClick={handleSwap}
                      disabled={!canSwap}
                    >
                      {isSwapping && <Loader2 className="w-4 h-4 animate-spin" />}
                      SWAP <Kbd>S</Kbd>
                    </Button>
                  </div>
                </div>
              );
            }}
          </form.Subscribe>

          {/* tx status */}
          {(isSwapPending || isSwapConfirming || isSwapConfirmed || !!swapTxHash) && (
            <div className="ml-9">
              <TransactionStatus
                isPending={isSwapPending}
                isConfirming={isSwapConfirming}
                isConfirmed={isSwapConfirmed}
                txHash={swapTxHash}
                blockExplorerUrl={connection.chain?.blockExplorers?.default.url}
              />
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

type AggregatorRoute = {
  aggregator: string;
  amountOut: string;
};

function RouteSelector({
  zfiQuery,
  onRouteChange,
}: {
  zfiQuery: UseQueryResult<ZfiQuoteResponse>;
  onRouteChange?: (route: AggregatorRoute) => void;
}) {
  const bestSource = zfiQuery.data?.bestRoute.source;
  const bestAmountOut = zfiQuery.data?.bestRoute.expectedOutput;

  const routes: AggregatorRoute[] = (zfiQuery.data?.allQuotes ?? []).map((q) => ({
    aggregator: q.source,
    amountOut: q.amountOut,
  }));

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Auto-select best route when data arrives
  useEffect(() => {
    if (!zfiQuery.data) return;
    const bestIdx = routes.findIndex(
      (r) => r.aggregator === bestSource && r.amountOut === bestAmountOut
    );
    const idx = bestIdx !== -1 ? bestIdx : 0;
    setSelectedIdx(idx);
    if (routes[idx]) onRouteChange?.(routes[idx]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zfiQuery.data]);

  const selectedRoute = selectedIdx !== null ? routes[selectedIdx] : null;
  const selectedLabel = selectedRoute?.aggregator ?? (zfiQuery.isPending ? "Loading…" : "—");

  return (
    <Accordion className="mx-0">
      <AccordionItem value="route">
        <AccordionTrigger className="py-0 hover:no-underline">
          <div className="flex flex-1 flex-row items-center justify-between pr-1 text-xs">
            <p className="text-muted-foreground">Route</p>
            {zfiQuery.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : (
              <p>{selectedLabel}</p>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-1 pt-1">
            {zfiQuery.isPending && (
              <div className="flex flex-col gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex flex-row items-center justify-between px-2 py-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            )}
            {zfiQuery.isError && (
              <p className="px-2 py-1.5 text-xs text-destructive">
                Failed to fetch routes.
              </p>
            )}
            {!zfiQuery.isPending && !zfiQuery.isError && routes.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Enter an amount to see routes.
              </p>
            )}
            {routes.map((route, idx) => {
              const isBest = route.aggregator === bestSource && route.amountOut === bestAmountOut;
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setSelectedIdx(idx); onRouteChange?.(route); }}
                  className={`flex flex-row items-center justify-between px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:cursor-pointer ${isSelected ? "bg-accent" : ""}`}
                >
                  <div className="flex flex-row items-center gap-2">
                    <Check className={`w-3 h-3 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                    <span className="font-medium">{route.aggregator}</span>
                    {isBest && <span className="text-green-500">best</span>}
                  </div>
                  <span>{route.amountOut}</span>
                </button>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function TokenBalanceRow({
  tokenAddress,
  tokens,
  chainId,
  showRefresh = false,
}: {
  tokenAddress: string;
  tokens: TokenListToken[];
  chainId: number | null;
  showRefresh?: boolean;
}) {
  const connection = useConnection();
  const isNative = tokenAddress.toLowerCase() === ETH_ADDRESS.toLowerCase();
  const tokenMeta = tokens.find((t) => t.address === tokenAddress);
  const enabled = !!connection.address && !!chainId && !!tokenAddress;

  const { data: ethData, isLoading: isLoadingEth, refetch: refetchEth } = useBalance({
    address: connection.address,
    chainId: chainId ?? undefined,
    query: { enabled: enabled && isNative },
  });

  const { data: erc20Balance, isLoading: isLoadingErc20, refetch: refetchErc20 } = useReadContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connection.address as Address],
    chainId: chainId ?? undefined,
    query: { enabled: enabled && !isNative },
  });

  const isLoading = isNative ? isLoadingEth : isLoadingErc20;
  const refetch = isNative ? refetchEth : refetchErc20;

  const decimals = isNative ? (ethData?.decimals ?? 18) : (tokenMeta?.decimals ?? 18);
  const symbol = isNative ? (ethData?.symbol ?? "ETH") : (tokenMeta?.symbol ?? "");
  const rawBalance = isNative ? ethData?.value : (erc20Balance as bigint | undefined);
  const formatted = rawBalance !== undefined ? formatUnits(rawBalance, decimals) : "0";

  if (!tokenAddress) return null;

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex flex-row gap-2">
        {isLoading ? (
          <Skeleton className="w-16 h-4" />
        ) : (
          <span className="text-muted-foreground">{formatted}</span>
        )}
        <span className="text-muted-foreground">{symbol}</span>
      </div>
      {showRefresh && (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none hover:cursor-pointer"
          type="button"
          onClick={() => refetch()}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function TokenPickerDialog({
  tokens,
  value,
  onSelect,
  disabledAddress,
  isLoading,
}: {
  tokens: TokenListToken[];
  value: string;
  onSelect: (address: string) => void;
  disabledAddress?: string;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");

  const selected = tokens.find((t) => t.address === value);
  const filtered = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog onOpenChange={(open) => { if (!open) setSearch(""); }}>
      <DialogTrigger
        disabled={isLoading}
        render={
          <button
            type="button"
            className="flex items-center gap-1 shrink-0 border border-input px-2.5 py-1.5 text-xs hover:cursor-pointer hover:bg-accent transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          />
        }
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span>{selected ? selected.symbol : "Select"}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select token</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          type="text"
          placeholder="Search by name or symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-input bg-transparent px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No tokens found</p>
          ) : (
            filtered.map((token) => (
              <DialogClose
                key={token.address}
                disabled={token.address === disabledAddress}
                render={
                  <button
                    type="button"
                    onClick={() => onSelect(token.address)}
                    className="flex items-center justify-between px-2.5 py-2 text-xs text-left hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:cursor-pointer"
                  />
                }
              >
                <span className="font-medium">{token.symbol}</span>
                <span className="text-muted-foreground">{token.name}</span>
              </DialogClose>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// function TokenFieldInfo({ field }: { field: AnyFieldApi }) {
//   return (
//     <>
//       {field.state.meta.isTouched && !field.state.meta.isValid ? (
//         <em className="text-red-400">{field.state.meta.errors.join(",")}</em>
//       ) : field.state.meta.isTouched ? (
//         <em className="text-green-500">ok!</em>
//       ) : null}
//       {field.state.meta.isValidating ? "Validating..." : null}
//     </>
//   );
// }

// function AmountFieldInfo({ field }: { field: AnyFieldApi }) {
//   return (
//     <>
//       {!field.state.meta.isTouched ? (
//         <em>Please enter an amount to swap</em>
//       ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
//         <em
//           className={
//             field.state.meta.errors.join(",") === "Please enter an amount"
//               ? ""
//               : "text-red-400"
//           }
//         >
//           {field.state.meta.errors.join(",")}
//         </em>
//       ) : (
//         <em className="text-green-500">ok!</em>
//       )}
//       {field.state.meta.isValidating ? "Validating..." : null}
//     </>
//   );
// }
