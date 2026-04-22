import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useForm, useStore } from "@tanstack/react-form";
import {
  Loader2,
  Check,
  ArrowUpDown,
  Eraser,
  RefreshCcw,
  Quote,
} from "lucide-react";
import { type Address, type Hash, erc20Abi, encodeFunctionData, formatUnits, parseUnits, maxUint256 } from "viem";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { swapRouteAtom } from "@/atoms/swap-route";
import { useZfiQuery } from "@/components/swap-zfi";
import {
  useReadContract,
  useBalance,
  useConnection,
  useCapabilities,
  useWriteContract,
  useSendTransaction,
  useSendCalls,
  useWaitForTransactionReceipt,
  useWaitForCallsStatus
} from "wagmi";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenPickerDialog, type TokenListToken } from "@/components/token-picker-dialog";
import { Kbd } from "@/components/ui/kbd";
import { TransactionStatus } from "@/components/transaction-status";
import { InformationDialog } from "@/components/information-dialog";
import { ETH_ADDRESS } from "@/lib/constants";


// ── Main swap component ──────────────────────────────────────
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

// ── Slippage presets ──────────────────────────────────────────────
const SLIPPAGE_PRESETS = ["0.02", "0.1", "0.5", "1"] as const;

// ── Amount presets ──────────────────────────────────────────────
const AMOUNT_PRESETS = [
  { label: "25%", num: BigInt(1), den: BigInt(4) },
  { label: "50%", num: BigInt(1), den: BigInt(2) },
  { label: "75%", num: BigInt(3), den: BigInt(4) },
  { label: "Max", num: BigInt(1), den: BigInt(1) },
] as const;

// ── Swap form component ──────────────────────────────────────
function SwapForm() {
  // Media query hook
  // Use a media query to determine if the screen is desktop or mobile.
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Wagmi useConnection hook
  // Use the useConnection hook to get the current wallet connection.
  const connection = useConnection();

  // Tanstack useSearch hook
  // Use the useSearch hook to get the search parameters from the URL.
  const search = useSearch({ from: '/swap' });

  // Tanstack useNavigate hook
  // Use the useNavigate hook to navigate to the swap page.
  const navigate = useNavigate({ from: '/swap' });

  // React Query useQuery hook
  // Use the useQuery hook to fetch the token list from the token-list.json file.
  // This token list most likely would hit cache
  const { data: tokenList, isLoading: isLoadingTokens } = useQuery({
    queryKey: ["token-list"],
    queryFn: async () => {
      const res = await fetch("/token-list.json");
      if (!res.ok) throw new Error("Failed to fetch token list");
      return res.json() as Promise<{ tokens: TokenListToken[] }>;
    },
    staleTime: Infinity,
  });

  // Wagmi useCapabilities hook
  // Use the useCapabilities hook to get the capabilities of the current wallet.
  const { data: capabilities } = useCapabilities();
  // Check if the current wallet supports atomic batch transactions.
  const supportsAtomicBatch =
    capabilities?.[connection.chain?.id ?? 0]?.atomicBatch?.supported ?? false;

  const effectiveChain = search.chain ?? connection.chain?.id ?? null;
  const tokens = useMemo(
    () => effectiveChain ? (tokenList?.tokens.filter((t) => t.chainId === effectiveChain) ?? []) : [],
    [tokenList, effectiveChain],
  );

  const form = useForm({
    defaultValues: {
      tokenIn: search.from as string | undefined,
      tokenOut: search.to,
      amountIn: "",
      slippage: "0.1",
    },
    onSubmit: async ({ value }) => {
      // TODO: integrate DEX aggregator (e.g. 0x, Uniswap Universal Router)
      console.log("swap", value);
    },
  });

  const handleSelectTokenIn = useCallback((address: string) => {
    form.setFieldValue("tokenIn", address);
    void navigate({ search: (prev) => ({ ...prev, from: address }) });
  }, [form, navigate]);

  const handleSelectTokenOut = useCallback((address: string) => {
    form.setFieldValue("tokenOut", address);
    void navigate({ search: (prev) => ({ ...prev, to: address }) });
  }, [form, navigate]);

  const tokenIn = useStore(form.store, (state) => state.values.tokenIn);
  const tokenOut = useStore(form.store, (state) => state.values.tokenOut);
  const amountIn = useStore(form.store, (state) => state.values.amountIn);
  const slippage = useStore(form.store, (state) => state.values.slippage);
  const canSubmit = useStore(form.store, (state) => state.canSubmit);

  // Swap route atom — source of truth for quote results and selection
  const swapRoute = useAtomValue(swapRouteAtom);
  const setSwapRoute = useSetAtom(swapRouteAtom);
  const selectedRouteKey = swapRoute.selected
    ? `${swapRoute.selected.aggregator}:${swapRoute.selected.amountOut}`
    : null;
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


  function getParsedAmountIn(): bigint | undefined {
    const raw = form.getFieldValue("amountIn");
    try {
      return raw ? parseUnits(raw, tokenInDecimals) : undefined;
    } catch {
      return undefined;
    }
  }

  const formattedAmountOut = swapRoute.selected?.amountOut
    ? formatUnits(BigInt(swapRoute.selected.amountOut), tokenOutDecimals)
    : "";

  // ZFI on-chain quote — amountIn subscribed live so refetch always gets the current value
  const { refetch: refetchQuote, isFetching: isFetchingQuote, isError: isErrorQuote } = useZfiQuery({
    amountIn,
    tokenInDecimals,
    tokenIn,
    tokenOut,
    slippage,
    recipient: connection.address,
    chainId: effectiveChain,
  });

  const isNativeTokenIn = tokenIn?.toLowerCase() === ETH_ADDRESS.toLowerCase();
  const isNativeTokenOut = tokenOut?.toLowerCase() === ETH_ADDRESS.toLowerCase();

  // ── Balances ─────────────────────────────────────────────────────────────
  // Native ETH balance — always fetched for gas estimation.
  // Also used as tokenIn or tokenOut balance when either is ETH.
  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useBalance({
    address: connection.address,
    chainId: effectiveChain ?? undefined,
    query: { enabled: !!connection.address && !!effectiveChain },
  });

  // ERC20 balance for tokenIn — only when tokenIn is not ETH.
  const {
    data: erc20TokenInBalance,
    isLoading: isLoadingErc20TokenIn,
    refetch: refetchErc20TokenIn,
  } = useReadContract({
    address: tokenIn as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connection.address as Address],
    chainId: effectiveChain ?? undefined,
    query: { enabled: !!connection.address && !!effectiveChain && !!tokenIn && !isNativeTokenIn },
  });

  // ERC20 balance for tokenOut — only when tokenOut is not ETH.
  const {
    data: erc20TokenOutBalance,
    isLoading: isLoadingErc20TokenOut,
    refetch: refetchErc20TokenOut,
  } = useReadContract({
    address: tokenOut as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connection.address as Address],
    chainId: effectiveChain ?? undefined,
    query: { enabled: !!connection.address && !!effectiveChain && !!tokenOut && !isNativeTokenOut },
  });

  const tokenInRawBalance: bigint | undefined = isNativeTokenIn ? nativeBalance?.value : (erc20TokenInBalance as bigint | undefined);
  const isLoadingTokenInBalance = isNativeTokenIn ? isLoadingNativeBalance : isLoadingErc20TokenIn;
  const refetchTokenInBalance = isNativeTokenIn ? refetchNativeBalance : refetchErc20TokenIn;
  const tokenInSymbol = isNativeTokenIn ? (nativeBalance?.symbol ?? "ETH") : (tokenInMeta?.symbol ?? "");

  const tokenOutRawBalance: bigint | undefined = isNativeTokenOut ? nativeBalance?.value : (erc20TokenOutBalance as bigint | undefined);
  const isLoadingTokenOutBalance = isNativeTokenOut ? isLoadingNativeBalance : isLoadingErc20TokenOut;
  const refetchTokenOutBalance = isNativeTokenOut ? refetchNativeBalance : refetchErc20TokenOut;
  const tokenOutSymbol = isNativeTokenOut ? (nativeBalance?.symbol ?? "ETH") : (tokenOutMeta?.symbol ?? "");

  const approvalTarget = swapRoute.selected?.approvalTarget;

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

  const parsedAmountInForAllowance = getParsedAmountIn();
  const isAllowanceSufficient =
    isNativeTokenIn ||
    (currentAllowance !== undefined &&
      parsedAmountInForAllowance !== undefined &&
      currentAllowance >= parsedAmountInForAllowance);

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
    const parsedAmountIn = getParsedAmountIn();
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
    const tx = swapRoute.selected?.tx;
    if (!tx) return;
    sendTransaction({
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      chainId: effectiveChain ?? undefined,
    });
  }

  // ── Atomic batch swap (EIP-5792) ──────────────────────────────────────────
  const sendCalls = useSendCalls();

  const { data: batchCallsStatus } = useWaitForCallsStatus({
    id: sendCalls.data?.id ?? "",
    pollingInterval: 1000,
    query: { enabled: !!sendCalls.data },
  });

  const isBatchConfirming =
    !!sendCalls.data &&
    batchCallsStatus?.status !== "success" &&
    batchCallsStatus?.status !== "failure";
  const isBatchConfirmed = batchCallsStatus?.status === "success";
  const batchTxHash = batchCallsStatus?.receipts?.at(-1)?.transactionHash as Hash | undefined;

  function handleSwapAtomic() {
    const parsedAmountIn = getParsedAmountIn();
    const selected = swapRoute.selected;
    const tx = selected?.tx;
    const approvalTargetAddr = selected?.approvalTarget;
    if (!tx || !approvalTargetAddr || !parsedAmountIn) return;
    sendCalls.mutate({
      calls: [
        {
          to: tokenIn as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [approvalTargetAddr, parsedAmountIn],
          }),
        },
        {
          to: tx.to as Address,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value),
        },
      ],
      chainId: effectiveChain ?? undefined,
    });
  }

  function handleSwapDispatch() {
    if (supportsAtomicBatch && !isNativeTokenIn) {
      handleSwapAtomic();
    } else {
      handleSwap();
    }
  }

  function handleReset() {
    form.reset();
    setSwapRoute({ selected: null, zfi: [] });
  }

  const handlersRef = useRef({
    handleReset,
    handleApproveExact,
    handleApproveUnlimited,
    handleRevoke,
    handleSwap: handleSwapDispatch,
    refetchQuote: () => void refetchQuote(),
    isSubmitting: () => form.state.isSubmitting,
  });
  useEffect(() => {
    handlersRef.current = {
      handleReset,
      handleApproveExact,
      handleApproveUnlimited,
      handleRevoke,
      handleSwap: handleSwapDispatch,
      refetchQuote: () => void refetchQuote(),
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
              {AMOUNT_PRESETS.map(({ label, num, den }) => (
                <button
                  key={label}
                  type="button"
                  className="text-xs hover:cursor-pointer underline underline-offset-4"
                  onClick={() => {
                    if (tokenInRawBalance === undefined) return;
                    const amount = formatUnits((tokenInRawBalance * num) / den, tokenInDecimals);
                    form.setFieldValue("amountIn", amount);
                  }}
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
              {() => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={tokenIn}
                  onSelect={handleSelectTokenIn}
                  disabledAddress={tokenOut}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          {tokenIn && (
            <TokenBalanceRow
              rawBalance={tokenInRawBalance}
              decimals={tokenInDecimals}
              symbol={tokenInSymbol}
              isLoading={isLoadingTokenInBalance}
              refetch={refetchTokenInBalance}
              showRefresh
            />
          )}
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
            {isFetchingQuote ? (
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
              {() => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={tokenOut}
                  onSelect={handleSelectTokenOut}
                  disabledAddress={tokenIn}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          {tokenOut && (
            <TokenBalanceRow
              rawBalance={tokenOutRawBalance}
              decimals={tokenOutDecimals}
              symbol={tokenOutSymbol}
              isLoading={isLoadingTokenOutBalance}
              refetch={refetchTokenOutBalance}
              showRefresh
            />
          )}
        </div>
        {/* ── Swap Info ───────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between text-xs gap-1 lg:gap-0">
            <p className="text-muted-foreground">Max slippage</p>
            <div className="flex items-center gap-1">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => form.setFieldValue("slippage", preset)}
                  className={`px-1.5 py-0.5 border text-xs hover:cursor-pointer hover:bg-accent transition-colors ${slippage === preset ? "border-primary text-primary" : "border-input text-muted-foreground"}`}
                >
                  {preset}%
                </button>
              ))}
              <form.Field
                name="slippage"
                validators={{
                  onChange: ({ value }) => {
                    if (!/^\d*\.?\d*$/.test(value)) return "Numbers only";
                    const n = parseFloat(value);
                    if (isNaN(n) || n <= 0) return "Must be greater than 0";
                    if (n > 50) return "Must be 50% or less";
                    return undefined;
                  },
                }}
              >
                {(field) => (
                  isDesktop ? (
                    <input
                      id={field.name}
                      name={field.name}
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                      className={`w-12 border bg-transparent px-1.5 py-0.5 text-xs text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-primary ${field.state.meta.errors.length ? "border-destructive" : "border-input"}`}
                    />
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      type="number"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                      className={`w-12 border bg-transparent px-1.5 py-0.5 text-xs text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-primary ${field.state.meta.errors.length ? "border-destructive" : "border-input"}`}
                    />
                  )
                )}
              </form.Field>
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Fee</p>
            <p>Free</p>
          </div>
          {!isNativeTokenIn && (
            <div className="flex flex-row items-center justify-between text-xs">
              <p className="text-muted-foreground">Approval</p>
              {supportsAtomicBatch ? (
                <p className="text-green-500">Atomic</p>
              ) : (
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
              )}
            </div>
          )}
          <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
            {({ isSubmitting }) => (
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
                  onClick={() => void refetchQuote()}
                  disabled={!canSubmit || isFetchingQuote}
                >
                  {isFetchingQuote
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Quote className="w-3 h-3" />}
                  Get Quotes <Kbd>Q</Kbd>
                </Button>
              </div>
            )}
          </form.Subscribe>
          <SwapRouteSelector
            tokenOutDecimals={tokenOutDecimals}
            isFetching={isFetchingQuote}
            isError={isErrorQuote}
          />
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 pt-6">
          <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit })}>
            {({ canSubmit }) => {
              const isApproving = isApprovePending || isApproveConfirming;
              const isSwapping =
                isSwapPending || isSwapConfirming || sendCalls.isPending || isBatchConfirming;
              const canSwap =
                canSubmit &&
                !!swapRoute.selected &&
                (isAllowanceSufficient || supportsAtomicBatch) &&
                !isSwapping;
              const canApprove = canSubmit && !!approvalTarget && !isApproving;

              if (isNativeTokenIn || supportsAtomicBatch) {
                const isBatch = supportsAtomicBatch && !isNativeTokenIn;
                return (
                  <div className="flex flex-col gap-2">
                    <Button
                      className="hover:cursor-pointer rounded-none w-full"
                      type="button"
                      onClick={isBatch ? handleSwapAtomic : handleSwap}
                      disabled={!canSwap}
                    >
                      {isSwapping && <Loader2 className="w-4 h-4 animate-spin" />}
                      SWAP <Kbd>S</Kbd>
                    </Button>
                    <TransactionStatus
                      isPending={isBatch ? sendCalls.isPending : isSwapPending}
                      isConfirming={isBatch ? isBatchConfirming : isSwapConfirming}
                      isConfirmed={isBatch ? isBatchConfirmed : isSwapConfirmed}
                      txHash={isBatch ? batchTxHash : swapTxHash}
                      blockExplorerUrl={connection.chain?.blockExplorers?.default.url}
                      signedLabel={isBatch ? "Bundle submitted" : undefined}
                    />
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-4">
                  {/* step 1 — approve */}
                  <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${isAllowanceSufficient ? "border-green-500 text-green-500" : "border-muted-foreground text-muted-foreground"}`}>
                      1
                    </span>
                    <div className="flex flex-row gap-2">
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
                      <>
                        <div />
                        <TransactionStatus
                          isPending={isApprovePending}
                          isConfirming={isApproveConfirming}
                          isConfirmed={isApproveConfirmed}
                          txHash={approveTxHash}
                          blockExplorerUrl={connection.chain?.blockExplorers?.default.url}
                        />
                      </>
                    )}
                  </div>

                  {/* step 2 — swap */}
                  <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${isAllowanceSufficient ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
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
                    <div />
                    <TransactionStatus
                      isPending={isSwapPending}
                      isConfirming={isSwapConfirming}
                      isConfirmed={isSwapConfirmed}
                      txHash={swapTxHash}
                      blockExplorerUrl={connection.chain?.blockExplorers?.default.url}
                    />
                  </div>
                </div>
              );
            }}
          </form.Subscribe>
        </div>
      </div>
    </form>
  );
}

function TokenBalanceRow({
  rawBalance,
  decimals,
  symbol,
  isLoading,
  refetch,
  showRefresh = false,
}: {
  rawBalance: bigint | undefined;
  decimals: number;
  symbol: string;
  isLoading: boolean;
  refetch: () => void;
  showRefresh?: boolean;
}) {
  const formatted = rawBalance !== undefined ? formatUnits(rawBalance, decimals) : "0";

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex flex-row gap-2 text-xs">
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

function SwapRouteSelector({
  tokenOutDecimals,
  isFetching,
  isError,
}: {
  tokenOutDecimals: number;
  isFetching: boolean;
  isError: boolean;
}) {
  const [swapRoute, setSwapRoute] = useAtom(swapRouteAtom);
  const routes = swapRoute.zfi;

  return (
    <div className="flex flex-col border border-primary text-xs">
      <div className="flex flex-row items-center gap-2 px-2 py-1.5 border-b border-primary">
        <p>Swap Routes</p>
        <InformationDialog
          title="Swap Routes"
          content="Select a route provider below to swap. Routes are sorted by the best output amount."
        />
      </div>
      <div className="flex flex-col max-h-32 overflow-y-auto">
        {isFetching && (
          <div className="flex flex-col">
            {[...Array(1)].map((_, i) => (
              <div key={i} className="flex flex-row items-center justify-between px-2 py-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        )}
        {isError && !isFetching && (
          <p className="px-2 py-1.5 text-destructive">Failed to fetch routes.</p>
        )}
        {!isFetching && !isError && routes.length === 0 && (
          <p className="px-2 py-1.5 text-muted-foreground">Enter an amount and get quotes.</p>
        )}
        {!isFetching && routes.map((route, idx) => {
          const isSelected = swapRoute.selected?.aggregator === route.aggregator;
          const formatted = formatUnits(BigInt(route.amountOut), tokenOutDecimals);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSwapRoute((prev) => ({ ...prev, selected: route }))}
              className={`flex flex-row items-center justify-between px-2 py-1.5 transition-colors hover:bg-accent hover:cursor-pointer ${isSelected ? "bg-accent" : ""}`}
            >
              <div className="flex flex-row items-center gap-2">
                <Check className={`w-3 h-3 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                <span className="font-medium">{route.aggregator}</span>
              </div>
              <span>{formatted}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}