import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Sigma, Eraser } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS, BATCH_DISTRIBUTOR_FEE } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

export function BatchTextEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
  token,
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

  const symbol = token ? token.symbol : (nativeBalance?.symbol ?? "ETH");

  const parseAmount = (amount: string): bigint => {
    if (token) return parseUnits(amount, token.decimals);
    return parseEther(amount);
  };

  const formatAmount = (amount: bigint): string => {
    if (token) return formatUnits(amount, token.decimals);
    return formatEther(amount);
  };

  const parsed = useMemo(() => parseRecipients(text), [text]);

  let totalAmount = BigInt(0);
  for (const r of parsed.valid) {
    try {
      totalAmount += parseAmount(r.amount);
    } catch {
      // ignore
    }
  }

  // ERC20 allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connection.address!, BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address],
    query: { enabled: !!token && !!connection.address },
  });

  useEffect(() => {
    if (isApproveConfirmed) void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  const needsApproval = !!token && allowance !== undefined && totalAmount > 0n && allowance < totalAmount;

  // Balance checks
  const isOverBalance = token
    ? (token.balance !== undefined && totalAmount > token.balance)
    : (nativeBalance ? totalAmount + BATCH_DISTRIBUTOR_FEE > nativeBalance.value : false);
  const isOverNativeBalance = token
    ? (nativeBalance ? BATCH_DISTRIBUTOR_FEE > nativeBalance.value : false)
    : false;

  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverBalance && !isOverNativeBalance;

  const simulatedAddresses = parsed.valid.map((r) => r.address);
  const simulatedAmounts = parsed.valid.map((r) => {
    try {
      return parseAmount(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract(
    token
      ? {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeToken",
          args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
          query: { enabled: showTxObject && simulatedAddresses.length > 0 && totalAmount > 0n && !needsApproval },
        }
      : {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeEther",
          args: [{ txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: totalAmount + BATCH_DISTRIBUTOR_FEE,
          query: { enabled: showTxObject && simulatedAddresses.length > 0 && totalAmount > BigInt(0) },
        }
  );

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseAmount(r.amount));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
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
      {/* balance + running total */}
      <div className="flex flex-col gap-1 text-sm items-end">
        <div className="flex flex-row gap-2 items-center">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          {isBalanceLoading ? (
            <Skeleton className="w-24 h-4" />
          ) : (
            <span>
              {token
                ? (token.balance !== undefined ? formatUnits(token.balance, token.decimals) : "—")
                : formatEther(nativeBalance?.value ?? BigInt(0))}{" "}
              {symbol}
            </span>
          )}
        </div>
        <div className="flex flex-row gap-2 items-center">
          <Sigma className="w-4 h-4 text-muted-foreground" />
          <span className={isOverBalance ? "text-red-400" : ""}>
            {token
              ? `${formatAmount(totalAmount)} ${symbol}`
              : `${formatEther(totalAmount + BATCH_DISTRIBUTOR_FEE)} ${symbol}`}
          </span>
        </div>
      </div>

      {/* editor */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          One recipient per line: <code>address,amount</code>. Lines starting with{" "}
          <code>#</code> are ignored.
        </label>
        <Suspense fallback={<div className="h-48 w-full bg-muted/50 animate-pulse border" />}>
          <CodeMirror
            value={text}
            onChange={setText}
            extensions={[EditorView.lineWrapping]}
            theme={isDark ? githubDark : githubLight}
            placeholder={token ? "0xRecipient1,100\n0xRecipient2,250\n# comment" : "0xRecipient1,0.01\n0xRecipient2,0.05\n# comment"}
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

      {/* actions */}
      <div className="flex flex-col gap-2">
        {token && needsApproval && (
          <Button
            type="button"
            variant="outline"
            className="rounded-none w-full hover:cursor-pointer"
            disabled={approveWrite.isPending || isApproveConfirming}
            onClick={async () => {
              try {
                await approveWrite.mutateAsync({
                  address: token.address,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, totalAmount],
                });
              } catch {
                // user rejected or tx failed — errors surfaced by wallet
              }
            }}
          >
            {approveWrite.isPending || isApproveConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              `Approve ${symbol}`
            )}
          </Button>
        )}
        <div className="grid grid-cols-5 gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-none hover:cursor-pointer col-span-1"
            onClick={() => setText("")}
          >
            <Eraser className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-none hover:cursor-pointer col-span-2"
            disabled={!canSubmit || isPending}
            onClick={() => setShowTxObject((prev) => !prev)}
          >
            Request
          </Button>
          <Button
            type="button"
            className="rounded-none hover:cursor-pointer col-span-2"
            disabled={!canSubmit || needsApproval || isPending}
            onClick={handleSubmit}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Send batch"
            )}
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

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
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
      />
    </div>
  );
}
