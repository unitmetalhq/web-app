import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser, Upload, FileText, X } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, encodeFunctionData, erc20Abi, erc721Abi, maxUint256, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, usePrepareTransactionRequest, useReadContract, useConnection } from "wagmi";
import { useIsViewOnly } from "@/hooks/use-is-view-only";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

// Default sample CSV shown for native ETH mode. ERC20 and NFT modes generate
// their own samples inline since the format differs (amounts vs token IDs).
export const BATCH_SAMPLE_CSV = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01
0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,0.05`;

// ── BatchFileUpload ───────────────────────────────────────────────────────────
//
// CSV file upload editor for batch sends. The user drops or browses for a
// .csv file; its contents are read as text and passed through the same
// parseRecipients parser used by the text editor. Supports the same three
// modes as the other editors:
//   • Native ETH  — no `token` prop, format: address,amount
//   • ERC20 token — `token` with isNft = false, format: address,amount
//   • ERC721 NFT  — `token` with isNft = true,  format: address,tokenId
//
// State machine for the file:
//   fileText === null  → no file loaded, drop zone is shown
//   fileText === ""    → file was rejected (wrong type), error implicit in parse
//   fileText !== ""    → file loaded and parsed, results shown below the file row

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
  const isViewOnly = useIsViewOnly();
  // Resolve block explorer URL for the currently selected chain so transaction
  // hashes can link out to the correct explorer.
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  // ── Contract writes ──────────────────────────────────────────────────────────
  // Two separate write hooks so approval and distribution have independent
  // pending/confirmed state and can each render their own TransactionStatus.
  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const approveWrite = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveWrite.data });

  // ── Fee ──────────────────────────────────────────────────────────────────────
  // Read the current fee from the contract rather than using a hardcoded
  // constant, so it stays accurate if the contract owner updates it.
  const { data: contractFee } = useReadContract({
    address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
    abi: BatchDistributorAbi,
    functionName: "fee",
  });
  const fee = contractFee ?? 1000000000000000n; // fallback: 0.001 ETH

  // ── File state ───────────────────────────────────────────────────────────────
  // fileName — displayed in the file info row after a file is loaded
  // fileText — raw CSV string; null means no file loaded (shows drop zone)
  // isDragging — tracks whether a file is being dragged over the drop zone
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Controls whether the raw transaction object preview is visible.
  const [showTxObject, setShowTxObject] = useState(false);
  const [showApproveTxObject, setShowApproveTxObject] = useState(false);
  const [showApproveUnlimitedTxObject, setShowApproveUnlimitedTxObject] = useState(false);
  // Hidden file input — triggered programmatically by clicking the drop zone.
  const inputRef = useRef<HTMLInputElement>(null);

  const isNft = token?.isNft ?? false;
  const symbol = token ? token.symbol : (nativeBalance?.symbol ?? "ETH");

  // ── Amount helpers ───────────────────────────────────────────────────────────
  // Unified parse/format that handles all three modes:
  //   NFT    → raw BigInt token ID (no decimals)
  //   ERC20  → parseUnits with the token's decimal count
  //   Native → parseEther (18 decimals)

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

  // ── Parsing ──────────────────────────────────────────────────────────────────
  // Parse only when fileText is non-null (a file has been loaded). Returns null
  // while the drop zone is shown so downstream checks can safely default to 0.
  // Memoised so it only re-runs when the file content or mode changes.
  const parsed = useMemo(() => (fileText !== null ? parseRecipients(fileText, isNft) : null), [fileText, isNft]);

  // Sum all valid amounts for balance checks and simulation.
  let totalAmount = BigInt(0);
  for (const r of parsed?.valid ?? []) {
    try {
      totalAmount += parseAmount(r.amount);
    } catch {
      // ignore rows that fail to parse
    }
  }

  // ── ERC20 allowance ──────────────────────────────────────────────────────────
  // Checks how much the BatchDistributor is already approved to spend on
  // behalf of the connected wallet. Skipped for NFTs — those use
  // isApprovedForAll (checked by the parent and passed in as a prop).
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [connection.address!, BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address],
    query: { enabled: !!token && !isNft && !!connection.address },
  });

  // After an approval tx confirms, re-fetch the allowance (ERC20) or notify
  // the parent to re-fetch isApprovedForAll (ERC721).
  useEffect(() => {
    if (isApproveConfirmed) {
      if (isNft) onApproveSuccess?.();
      else void refetchAllowance();
    }
  }, [isApproveConfirmed, isNft, refetchAllowance, onApproveSuccess]);

  // True when the current allowance is less than the total amount to send.
  const needsApproval = !isNft && !!token && allowance !== undefined && totalAmount > 0n && allowance < totalAmount;

  // ── Balance checks ───────────────────────────────────────────────────────────
  // isOverBalance      — the send amount exceeds the token/ETH balance
  // isOverNativeBalance — the wallet doesn't have enough ETH to cover the fee
  const isOverBalance = isNft
    ? false // NFTs don't have a fungible balance to check against
    : token
    ? (token.balance !== undefined && totalAmount > token.balance)
    : (nativeBalance ? totalAmount + fee > nativeBalance.value : false);
  const isOverNativeBalance = nativeBalance ? fee > nativeBalance.value : false;

  // ── Submit gate ──────────────────────────────────────────────────────────────
  // All conditions must pass before Send batch is enabled:
  //   • At least one valid recipient parsed from the file
  //   • No parse errors (errors.length defaults to 1 when parsed is null,
  //     preventing submission before any file is loaded)
  //   • Balance not exceeded
  //   • Enough ETH for the fee
  //   • For NFTs: isApprovedForAll must be true
  const canSubmit = (parsed?.valid.length ?? 0) > 0 && (parsed?.errors.length ?? 1) === 0 && !isOverBalance && !isOverNativeBalance
    && (!isNft || (isApprovedForAll ?? false));

  // ── Simulation ───────────────────────────────────────────────────────────────
  // Dry-runs the contract call so the user can inspect the raw transaction
  // object before signing. Only runs when "Request" is toggled and there are
  // valid recipients. For ERC20, simulation is skipped while approval is still
  // needed — the call would revert anyway.
  const simulatedAddresses = (parsed?.valid ?? []).map((r) => r.address);
  const simulatedAmounts = (parsed?.valid ?? []).map((r) => {
    try {
      return parseAmount(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  // ── Distribution tx preparation ──────────────────────────────────────────────
  const prepareEnabled = showTxObject && simulatedAddresses.length > 0;
  let distributionCalldata: `0x${string}` | undefined;
  let distributionValue = 0n;
  let distributionPrepareEnabled = false;
  try {
    if (isNft && token) {
      distributionCalldata = encodeFunctionData({ abi: BatchDistributorAbi, functionName: "distributeNft", args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }] });
      distributionValue = fee;
      distributionPrepareEnabled = prepareEnabled;
    } else if (token) {
      distributionCalldata = encodeFunctionData({ abi: BatchDistributorAbi, functionName: "distributeToken", args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }] });
      distributionValue = fee;
      distributionPrepareEnabled = prepareEnabled && totalAmount > 0n && !needsApproval;
    } else {
      distributionCalldata = encodeFunctionData({ abi: BatchDistributorAbi, functionName: "distributeEther", args: [{ txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }] });
      distributionValue = totalAmount + fee;
      distributionPrepareEnabled = prepareEnabled && totalAmount > 0n;
    }
  } catch { /* encoding failed — leave calldata undefined */ }
  const {
    data: preparedTx,
    isLoading: isLoadingPrepare,
    isError: isErrorPrepare,
  } = usePrepareTransactionRequest({
    to: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
    data: distributionCalldata,
    value: distributionValue,
    chainId: selectedChain ?? undefined,
    query: { enabled: !!distributionCalldata && distributionPrepareEnabled },
  });

  // ── View-only approval preparation ───────────────────────────────────────────
  // Exact approve: NFT → setApprovalForAll; ERC20 → approve(totalAmount)
  const approveCalldata = (isNft && !!token)
    ? encodeFunctionData({ abi: erc721Abi, functionName: "setApprovalForAll", args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true] })
    : (!!token && totalAmount > 0n)
    ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, totalAmount] })
    : undefined;
  const { data: preparedApprove, isLoading: isLoadingPrepareApprove, isError: isErrorPrepareApprove } = usePrepareTransactionRequest({
    to: token?.address,
    data: approveCalldata,
    chainId: selectedChain ?? undefined,
    query: { enabled: isViewOnly && !!token && showApproveTxObject && !!approveCalldata },
  });
  // Unlimited approve: ERC20 only → approve(maxUint256)
  const approveUnlimitedCalldata = (!isNft && !!token)
    ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, maxUint256] })
    : undefined;
  const { data: preparedApproveUnlimited, isLoading: isLoadingPrepareApproveUnlimited, isError: isErrorPrepareApproveUnlimited } = usePrepareTransactionRequest({
    to: token?.address,
    data: approveUnlimitedCalldata,
    chainId: selectedChain ?? undefined,
    query: { enabled: isViewOnly && !!token && showApproveUnlimitedTxObject && !!approveUnlimitedCalldata },
  });

  // ── File loading ─────────────────────────────────────────────────────────────
  // loadFile validates the file type before reading. Non-CSV files set fileText
  // to "" (empty string) rather than null so the drop zone is replaced by the
  // file info row — the parse result will show 0 valid recipients, which blocks
  // submission without needing a separate error state.
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

  // Resets all file-related state and clears the hidden input's value so the
  // same file can be re-selected after clearing.
  function handleClear() {
    setFileName(null);
    setFileText(null);
    setSubmitError(null);
    setShowTxObject(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── handleSubmit ─────────────────────────────────────────────────────────────
  // Dispatches to the correct BatchDistributor function based on the current
  // mode. Mirrors the same 3-way branch as the other editors.
  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseAmount(r.amount));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
      } else if (isNft && token) {
        // ERC721: amount field carries the token ID, not a fungible quantity.
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeNft",
          args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: fee,
        });
      } else if (token) {
        // ERC20: requires prior approval for at least totalAmount.
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeToken",
          args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: fee,
        });
      } else {
        // Native ETH: msg.value must cover the sum of all amounts plus the fee.
        const total = amounts.reduce((a, b) => a + b, BigInt(0));
        await writeContract.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeEther",
          args: [{ txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
          value: total + fee,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  const isBalanceLoading = token ? token.isLoading : isLoadingNativeBalance;
  const isPending = writeContract.isPending || isConfirming;

  // Sample CSV content adapts to the current mode so the downloaded file is
  // immediately usable without editing the column format.
  const sampleCsv = isNft
    ? `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,42\n0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,137`
    : token
    ? `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,100\n0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,250`
    : BATCH_SAMPLE_CSV;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* ── Sample CSV panel ──────────────────────────────────────────────────
          Shows the expected format and provides a download button so users
          can start from a correctly structured template. The format hint and
          sample rows adapt to the current mode (ETH / ERC20 / NFT). */}
      <div className="flex flex-col gap-1 border p-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Sample CSV format
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No header row. One recipient per line: <code>{isNft ? "address,tokenId" : "address,amount"}</code>
        </p>
        <pre className="text-xs bg-muted/50 p-2 mt-1 overflow-x-auto leading-5">{sampleCsv}</pre>
        {/* Download creates a Blob URL, triggers a click on a temporary anchor,
            then immediately revokes the URL to avoid memory leaks. */}
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

      {/* ── Drop zone / file loaded ───────────────────────────────────────────
          Two states controlled by fileText:
            null  → drop zone: accepts drag-and-drop or click-to-browse
            other → file info row + parse results

          The drop zone is a div with role="button" so it is keyboard accessible
          (Enter key triggers the hidden file input). isDragging provides visual
          feedback while a file is held over the zone. */}
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
          {/* Hidden input — visually absent but handles the browser file picker. */}
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
          {/* File info row — shows the filename and an X button to clear the
              file and return to the drop zone. */}
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

          {/* Parse results — shown once parsed is non-null. Reports the valid
              count in green, per-line errors in a scrollable list (capped at
              8rem to avoid a wall of errors for large bad files), and balance
              errors. An empty file with no errors shows a neutral hint. */}
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

      {/* ── Send Batch Info ───────────────────────────────────────────────────
          Summary strip: Reset button + Balance / Batch / Fee / Total rows.
          Reset is disabled when no file is loaded (fileText === null).
          Total row is only shown for native ETH sends. */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex flex-row items-center justify-between">
          {/* Disabled when no file is loaded — nothing to reset. */}
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
        {/* Balance — shows ETH for NFT mode (fee check only), token balance
            for ERC20, or ETH balance for native sends. */}
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
        {/* Batch — for NFTs shows the count of valid rows; for fungibles shows
            the formatted sum of all valid amounts. Defaults to 0 before a file
            is loaded (parsed is null). */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Batch</p>
          {isNft
            ? <p>{parsed?.valid.length ?? 0} {symbol}</p>
            : <p>{formatAmount(totalAmount)} {symbol}</p>
          }
        </div>
        {/* Fee — protocol fee paid to BatchDistributor, read live from chain. */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Fee</p>
          <p>{formatEther(fee)} {nativeBalance?.symbol ?? "ETH"}</p>
        </div>
        {/* Total — only relevant for native ETH where the fee is added on top
            of the send amount in the same msg.value. */}
        {!token && (
          <div className="flex flex-row gap-2 items-center justify-between text-xs">
            <p className="text-muted-foreground">Total</p>
            <div className={isOverBalance ? "text-red-400" : ""}>
              {formatEther(totalAmount + fee)} {symbol}
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────────
          Approval button appears only when needed (token not yet approved).
          For ERC721 it calls setApprovalForAll; for ERC20 it approves the
          exact totalAmount. The button is hidden once approval is granted.

          Request toggles the transaction object preview (simulation).
          Send batch is disabled until canSubmit and approval are satisfied. */}
      <div className="flex flex-col gap-2">
        {token && (isViewOnly
          ? (
            // View-only: Request buttons for approval tx objects
            isNft ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none w-full hover:cursor-pointer"
                  disabled={!canSubmit}
                  onClick={() => setShowApproveTxObject((prev) => !prev)}
                >
                  Request setApprovalForAll
                </Button>
                {showApproveTxObject && (
                  <TransactionObject
                    transactionObject={preparedApprove ?? null}
                    isLoading={isLoadingPrepareApprove}
                    isError={isErrorPrepareApprove}
                  />
                )}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none w-full hover:cursor-pointer"
                  disabled={!canSubmit}
                  onClick={() => setShowApproveTxObject((prev) => !prev)}
                >
                  Request exact approval
                </Button>
                {showApproveTxObject && (
                  <TransactionObject
                    transactionObject={preparedApprove ?? null}
                    isLoading={isLoadingPrepareApprove}
                    isError={isErrorPrepareApprove}
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none w-full hover:cursor-pointer"
                  onClick={() => setShowApproveUnlimitedTxObject((prev) => !prev)}
                >
                  Request unlimited approval
                </Button>
                {showApproveUnlimitedTxObject && (
                  <TransactionObject
                    transactionObject={preparedApproveUnlimited ?? null}
                    isLoading={isLoadingPrepareApproveUnlimited}
                    isError={isErrorPrepareApproveUnlimited}
                  />
                )}
              </>
            )
          ) : (
            // Normal: approval buttons shown only when needed
            isNft ? (
              !(isApprovedForAll ?? false) && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none w-full hover:cursor-pointer"
                  disabled={approveWrite.isPending || isApproveConfirming}
                  onClick={async () => {
                    try {
                      await approveWrite.mutateAsync({
                        address: token.address,
                        abi: erc721Abi,
                        functionName: "setApprovalForAll",
                        args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true],
                      });
                    } catch { /* user rejected or tx failed */ }
                  }}
                >
                  {approveWrite.isPending || isApproveConfirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : "Approve for all"}
                </Button>
              )
            ) : (
              needsApproval && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none hover:cursor-pointer"
                    disabled={approveWrite.isPending || isApproveConfirming}
                    onClick={async () => {
                      try {
                        await approveWrite.mutateAsync({
                          address: token.address,
                          abi: erc20Abi,
                          functionName: "approve",
                          args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, totalAmount],
                        });
                      } catch { /* user rejected or tx failed */ }
                    }}
                  >
                    {approveWrite.isPending || isApproveConfirming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : `Approve exact`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none hover:cursor-pointer"
                    disabled={approveWrite.isPending || isApproveConfirming}
                    onClick={async () => {
                      try {
                        await approveWrite.mutateAsync({
                          address: token.address,
                          abi: erc20Abi,
                          functionName: "approve",
                          args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, maxUint256],
                        });
                      } catch { /* user rejected or tx failed */ }
                    }}
                  >
                    {approveWrite.isPending || isApproveConfirming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : `Approve unlimited`}
                  </Button>
                </div>
              )
            )
          )
        )}
        <div className={isViewOnly ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
          <Button
            type="button"
            variant="outline"
            className="rounded-none hover:cursor-pointer"
            disabled={!canSubmit || isPending}
            onClick={() => setShowTxObject((prev) => !prev)}
          >
            Request
          </Button>
          {!isViewOnly && (
            <Button
              type="button"
              className="rounded-none hover:cursor-pointer"
              disabled={!canSubmit || (!isNft && needsApproval) || isPending}
              onClick={handleSubmit}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Transaction object preview ────────────────────────────────────────
          Shown when the user clicks "Request". Displays the raw calldata,
          value, and other fields from the simulated transaction. */}
      {showTxObject && (
        <TransactionObject
          transactionObject={preparedTx ?? null}
          isLoading={isLoadingPrepare}
          isError={isErrorPrepare}
        />
      )}

      {/* Approval transaction status — only shown for token sends once an
          approve tx has been initiated. */}
      {token && (approveWrite.data || approveWrite.isPending || isApproveConfirming) && (
        <TransactionStatus
          isPending={approveWrite.isPending}
          isConfirming={isApproveConfirming}
          isConfirmed={isApproveConfirmed}
          txHash={approveWrite.data}
          blockExplorerUrl={blockExplorerUrl}
        />
      )}

      {/* Distribution transaction status — always rendered so errors and the
          confirmed state persist even after the file is cleared. */}
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
