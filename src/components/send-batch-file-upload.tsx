import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser, Upload, FileText, X } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, erc721Abi, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS, BATCH_DISTRIBUTOR_FEE } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

export const BATCH_SAMPLE_CSV = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01
0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,0.05`;

export function BatchFileUpload({
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

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const approveWrite = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveWrite.data });

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const parsed = useMemo(() => (fileText !== null ? parseRecipients(fileText, isNft) : null), [fileText, isNft]);

  let totalAmount = BigInt(0);
  for (const r of parsed?.valid ?? []) {
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

  const canSubmit = (parsed?.valid.length ?? 0) > 0 && (parsed?.errors.length ?? 1) === 0 && !isOverBalance && !isOverNativeBalance
    && (!isNft || (isApprovedForAll ?? false));

  const simulatedAddresses = (parsed?.valid ?? []).map((r) => r.address);
  const simulatedAmounts = (parsed?.valid ?? []).map((r) => {
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
  const sampleCsv = isNft
    ? `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,42\n0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,137`
    : token
    ? `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,100\n0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,250`
    : BATCH_SAMPLE_CSV;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* sample format */}
      <div className="flex flex-col gap-1 border p-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Sample CSV format
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No header row. One recipient per line: <code>{isNft ? "address,tokenId" : "address,amount"}</code>
        </p>
        <pre className="text-xs bg-muted/50 p-2 mt-1 overflow-x-auto leading-5">{sampleCsv}</pre>
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2 self-start mt-1 hover:cursor-pointer"
          onClick={() => {
            const blob = new Blob([sampleCsv], { type: "text/csv" });
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
              {isOverNativeBalance && (
                <span className="text-red-400">Insufficient ETH for fee</span>
              )}
            </div>
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
            disabled={fileText === null}
            onClick={handleClear}
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
            ? <p>{parsed?.valid.length ?? 0} {symbol}</p>
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
