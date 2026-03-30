import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, erc721Abi, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS, BATCH_DISTRIBUTOR_FEE } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

export function BatchTextEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
  token,
  isApprovedForAll,
  onApproveSuccess,
}: BatchEditorProps) {
  const config = useConfig();
  const connection = useConnection();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const approveWrite = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveWrite.data });

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const isNft = token?.isNft ?? false;
  const symbol = token ? token.symbol : (nativeBalance?.symbol ?? "ETH");

  const parseAmount = (amount: string): bigint => {
    if (isNft) return BigInt(amount);
    if (token) return parseUnits(amount, token.decimals);
    return parseEther(amount);
  };

  const formatAmount = (amount: bigint): string => {
    if (isNft) return amount.toString();
    if (token) return formatUnits(amount, token.decimals);
    return formatEther(amount);
  };

  const parsed = useMemo(() => parseRecipients(text, isNft), [text, isNft]);

  let totalAmount = BigInt(0);
  for (const r of parsed.valid) {
    try {
      totalAmount += parseAmount(r.amount);
    } catch {
      // ignore
    }
  }

  // ERC20 allowance check (skipped for NFTs)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connection.address!, BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address],
    query: { enabled: !!token && !isNft && !!connection.address },
  });

  useEffect(() => {
    if (isApproveConfirmed) {
      if (isNft) onApproveSuccess?.();
      else void refetchAllowance();
    }
  }, [isApproveConfirmed, isNft, refetchAllowance, onApproveSuccess]);

  const needsApproval = !isNft && !!token && allowance !== undefined && totalAmount > 0n && allowance < totalAmount;

  // Balance checks
  const isOverBalance = isNft
    ? false
    : token
    ? (token.balance !== undefined && totalAmount > token.balance)
    : (nativeBalance ? totalAmount + BATCH_DISTRIBUTOR_FEE > nativeBalance.value : false);
  const isOverNativeBalance = nativeBalance ? BATCH_DISTRIBUTOR_FEE > nativeBalance.value : false;

  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverBalance && !isOverNativeBalance
    && (!isNft || (isApprovedForAll ?? false));

  const simulatedAddresses = parsed.valid.map((r) => r.address);
  const simulatedAmounts = parsed.valid.map((r) => {
    try {
      return parseAmount(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const simulateEnabled = showTxObject && simulatedAddresses.length > 0;
  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract(
    isNft && token
      ? {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeNft",
          args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
          query: { enabled: simulateEnabled },
        }
      : token
      ? {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeToken",
          args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
          query: { enabled: simulateEnabled && totalAmount > 0n && !needsApproval },
        }
      : {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeEther",
          args: [{ txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: totalAmount + BATCH_DISTRIBUTOR_FEE,
          query: { enabled: simulateEnabled && totalAmount > 0n },
        }
  );

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseAmount(r.amount));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
      } else if (isNft && token) {
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeNft",
          args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
        });
      } else if (token) {
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeToken",
          args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
        });
      } else {
        const total = amounts.reduce((a, b) => a + b, BigInt(0));
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeEther",
          args: [{ txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: total + BATCH_DISTRIBUTOR_FEE,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  const isBalanceLoading = token ? token.isLoading : isLoadingNativeBalance;
  const isPending = writeContract.isPending || isConfirming;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* editor */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          One recipient per line: <code>{isNft ? "address,tokenId" : "address,amount"}</code>. Lines starting with{" "}
          <code>#</code> are ignored.
        </label>
        <Suspense fallback={<div className="h-48 w-full bg-muted/50 animate-pulse border" />}>
          <CodeMirror
            value={text}
            onChange={setText}
            extensions={[EditorView.lineWrapping]}
            theme={isDark ? githubDark : githubLight}
            placeholder={isNft ? "0xRecipient1,42\n0xRecipient2,137\n# comment" : token ? "0xRecipient1,100\n0xRecipient2,250\n# comment" : "0xRecipient1,0.01\n0xRecipient2,0.05\n# comment"}
            height="200px"
            className="rounded-none text-xs"
          />
        </Suspense>
      </div>

      {/* parse status */}
      {text.trim() && (
        <div className="flex flex-col gap-1 text-xs">
          {parsed.valid.length > 0 && (
            <span className="text-green-500">
              {parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}
            </span>
          )}
          {parsed.errors.map((e) => (
            <span key={e.line} className="text-red-400">
              Line {e.line}: {e.reason} — <code>{e.text}</code>
            </span>
          ))}
          {isOverBalance && (
            <span className="text-red-400">Total amount exceeds balance</span>
          )}
          {isOverNativeBalance && (
            <span className="text-red-400">Insufficient ETH for fee</span>
          )}
        </div>
      )}

      {/* ── Send Batch Info ───────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex flex-row items-center justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-none hover:cursor-pointer w-fit"
            onClick={() => setText("")}
          >
            <Eraser className="w-4 h-4" />
            Reset
          </Button>
        </div>
        {/* balance */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Balance</p>
          {isBalanceLoading ? (
            <Skeleton className="w-24 h-4" />
          ) : isNft ? (
            <span className={isOverNativeBalance ? "text-red-400" : ""}>
              {formatEther(nativeBalance?.value ?? BigInt(0))} {nativeBalance?.symbol ?? "ETH"}
            </span>
          ) : (
            <span>
              {token
                ? (token.balance !== undefined ? formatUnits(token.balance, token.decimals) : "—")
                : formatEther(nativeBalance?.value ?? BigInt(0))}{" "}
              {symbol}
            </span>
          )}
        </div>
        {/* Batch */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Batch</p>
          {isNft
            ? <p>{parsed.valid.length} {symbol}</p>
            : <p>{formatAmount(totalAmount)} {symbol}</p>
          }
        </div>
        {/* fee */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Fee</p>
          <p>{formatEther(BATCH_DISTRIBUTOR_FEE)} {nativeBalance?.symbol ?? "ETH"}</p>
        </div>
        {/* total (only for native) */}
        {!token && (
          <div className="flex flex-row gap-2 items-center justify-between text-xs">
            <p className="text-muted-foreground">Total</p>
            <div className={isOverBalance ? "text-red-400" : ""}>
              {formatEther(totalAmount + BATCH_DISTRIBUTOR_FEE)} {symbol}
            </div>
          </div>
        )}
      </div>

      {/* actions */}
      <div className="flex flex-col gap-2">
        {token && (isNft ? !(isApprovedForAll ?? false) : needsApproval) && (
          <Button
            type="button"
            variant="outline"
            className="rounded-none w-full hover:cursor-pointer"
            disabled={approveWrite.isPending || isApproveConfirming}
            onClick={async () => {
              try {
                if (isNft) {
                  await approveWrite.mutateAsync({
                    address: token.address,
                    abi: erc721Abi,
                    functionName: "setApprovalForAll",
                    args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true],
                  });
                } else {
                  await approveWrite.mutateAsync({
                    address: token.address,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, totalAmount],
                  });
                }
              } catch {
                // user rejected or tx failed — errors surfaced by wallet
              }
            }}
          >
            {approveWrite.isPending || isApproveConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isNft ? (
              `Approve for all`
            ) : (
              `Approve ${symbol}`
            )}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-none hover:cursor-pointer"
            disabled={!canSubmit || isPending}
            onClick={() => setShowTxObject((prev) => !prev)}
          >
            Request
          </Button>
          <Button
            type="button"
            className="rounded-none hover:cursor-pointer"
            disabled={!canSubmit || (!isNft && needsApproval) || isPending}
            onClick={handleSubmit}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
          </Button>
        </div>
      </div>

      {showTxObject && (
        <TransactionObject
          transactionObject={simulatedTx?.request ?? null}
          isLoading={isLoadingSimulate}
          isError={isErrorSimulate}
        />
      )}

      {token && (approveWrite.data || approveWrite.isPending || isApproveConfirming) && (
        <TransactionStatus
          isPending={approveWrite.isPending}
          isConfirming={isApproveConfirming}
          isConfirmed={isApproveConfirmed}
          txHash={approveWrite.data}
          blockExplorerUrl={blockExplorerUrl}
        />
      )}

      <TransactionStatus
        isPending={writeContract.isPending}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        txHash={writeContract.data}
        blockExplorerUrl={blockExplorerUrl}
        error={submitError}
        onClearError={() => setSubmitError(null)}
      />
    </div>
  );
}
