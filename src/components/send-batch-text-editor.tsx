import { lazy, Suspense, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Sigma, Eraser } from "lucide-react";
import { parseEther, formatEther } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract } from "wagmi";
import { GASLITEDROP_CONTRACT_ADDRESS } from "@/lib/constants";
import { GasliteDropAbi } from "@/lib/abis/gaslite-drop-abi";
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
}: BatchEditorProps) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const parsed = useMemo(() => parseRecipients(text), [text]);

  let totalAmount = BigInt(0);
  for (const r of parsed.valid) {
    try {
      totalAmount += parseEther(r.amount);
    } catch {
      // ignore
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";
  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverBalance;

  const simulatedAddresses = parsed.valid.map((r) => r.address);
  const simulatedAmounts = parsed.valid.map((r) => {
    try {
      return parseEther(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract({
    address: GASLITEDROP_CONTRACT_ADDRESS,
    abi: GasliteDropAbi,
    functionName: "airdropETH",
    args: [simulatedAddresses, simulatedAmounts],
    value: totalAmount,
    query: {
      enabled: showTxObject && simulatedAddresses.length > 0 && totalAmount > BigInt(0),
    },
  });

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseEther(r.amount));
      const total = amounts.reduce((a, b) => a + b, BigInt(0));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
      } else {
        await writeContract.mutateAsync({
          address: GASLITEDROP_CONTRACT_ADDRESS,
          abi: GasliteDropAbi,
          functionName: "airdropETH",
          args: [addresses, amounts],
          value: total,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* balance + running total */}
      <div className="flex flex-col gap-1 text-sm items-end">
        <div className="flex flex-row gap-2 items-center">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          {isLoadingNativeBalance ? (
            <Skeleton className="w-24 h-4" />
          ) : (
            <span>
              {formatEther(nativeBalance?.value ?? BigInt(0))} {symbol}
            </span>
          )}
        </div>
        <div className="flex flex-row gap-2 items-center">
          <Sigma className="w-4 h-4 text-muted-foreground" />
          <span className={isOverBalance ? "text-red-400" : ""}>
            {formatEther(totalAmount)} {symbol}
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
            placeholder={"0xRecipient1,0.01\n0xRecipient2,0.05\n# comment"}
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
        </div>
      )}

      {/* actions */}
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
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={() => setShowTxObject((prev) => !prev)}
        >
          Request
        </Button>
        <Button
          type="button"
          className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={handleSubmit}
        >
          {writeContract.isPending || isConfirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Send batch"
          )}
        </Button>
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
