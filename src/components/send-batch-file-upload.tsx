"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, Sigma, Eraser, Upload, FileText, X } from "lucide-react";
import { parseEther, formatEther, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract } from "wagmi";
import { GASLITEDROP_CONTRACT_ADDRESS } from "@/lib/constants";
import { GasliteDropAbi } from "@/lib/abis/gaslite-drop-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

export const BATCH_SAMPLE_CSV = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01
0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,0.05`;

export function BatchFileUpload({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
}: BatchEditorProps) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (fileText !== null ? parseRecipients(fileText) : null), [fileText]);

  let totalAmount = BigInt(0);
  for (const r of parsed?.valid ?? []) {
    try {
      totalAmount += parseEther(r.amount);
    } catch {
      // ignore
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";
  const canSubmit = (parsed?.valid.length ?? 0) > 0 && (parsed?.errors.length ?? 1) === 0 && !isOverBalance;

  const simulatedAddresses = (parsed?.valid ?? []).map((r) => r.address);
  const simulatedAmounts = (parsed?.valid ?? []).map((r) => {
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

  function loadFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setFileName(file.name);
      setFileText("");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setFileText((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  function handleClear() {
    setFileName(null);
    setFileText(null);
    setSubmitError(null);
    setShowTxObject(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const handleSubmit = async () => {
    if (!parsed) return;
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

      {/* sample format */}
      <div className="flex flex-col gap-1 border p-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Sample CSV format
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No header row. One recipient per line: <code>address,amount</code>
        </p>
        <pre className="text-xs bg-muted/50 p-2 mt-1 overflow-x-auto leading-5">{BATCH_SAMPLE_CSV}</pre>
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2 self-start mt-1 hover:cursor-pointer"
          onClick={() => {
            const blob = new Blob([BATCH_SAMPLE_CSV], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "recipients-sample.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download sample
        </button>
      </div>

      {/* drop zone / file selected */}
      {fileText === null ? (
        <div
          role="button"
          tabIndex={0}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:cursor-pointer hover:border-primary hover:text-foreground ${isDragging ? "border-primary text-foreground bg-muted/30" : ""}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-6 h-6" />
          <span>Drop a CSV file here or click to browse</span>
          <span className="text-xs">Accepts .csv files only</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* file info row */}
          <div className="flex items-center gap-2 border p-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-none h-6 w-6 shrink-0 hover:cursor-pointer"
              onClick={handleClear}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* parse results */}
          {parsed && (
            <div className="flex flex-col gap-1 text-xs">
              {parsed.valid.length > 0 && (
                <span className="text-green-500">
                  {parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}
                </span>
              )}
              {parsed.errors.length > 0 && (
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {parsed.errors.map((e) => (
                    <span key={e.line} className="text-red-400">
                      Line {e.line}: {e.reason} — <code>{e.text}</code>
                    </span>
                  ))}
                </div>
              )}
              {parsed.valid.length === 0 && parsed.errors.length === 0 && (
                <span className="text-muted-foreground">No recipients found in file</span>
              )}
              {isOverBalance && (
                <span className="text-red-400">Total amount exceeds balance</span>
              )}
            </div>
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
          onClick={handleClear}
          disabled={fileText === null}
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
