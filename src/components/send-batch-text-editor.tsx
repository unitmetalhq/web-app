import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Eraser } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, erc721Abi, type Address } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRecipients, type BatchEditorProps } from "@/lib/send-batch-utils";

// CodeMirror is code-split and loaded lazily — it's a large bundle and isn't
// needed until the user switches to the text editor tab.
const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

// ── BatchTextEditor ───────────────────────────────────────────────────────────
//
// Free-text editor for batch sends. The user pastes or types one recipient per
// line in CSV format; the editor parses the text on every change and shows
// inline errors. Supports the same three modes as BatchSimpleEditor:
//   • Native ETH  — no `token` prop, format: address,amount
//   • ERC20 token — `token` with isNft = false, format: address,amount
//   • ERC721 NFT  — `token` with isNft = true,  format: address,tokenId
//
// Unlike the simple editor, there is no numbered step grid here — approval
// is surfaced as a single button that appears only when needed, above the
// Request / Send batch row.

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
  // Resolve block explorer URL for the currently selected chain so transaction
  // hashes can link out to the correct explorer.
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  // ── Theme ────────────────────────────────────────────────────────────────────
  // CodeMirror requires an explicit theme object, so we derive isDark from the
  // app theme context rather than relying on CSS variables.
  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

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

  // Raw editor content. Every change triggers a re-parse via useMemo.
  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Controls whether the raw transaction object preview is visible.
  const [showTxObject, setShowTxObject] = useState(false);

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
  // parseRecipients splits each non-comment line on the first comma, validates
  // the address, and checks the amount format. The isNft flag switches amount
  // validation from parseEther to integer-only (token ID).
  // Memoised so it only re-runs when the text or mode changes, not on every
  // unrelated render.
  const parsed = useMemo(() => parseRecipients(text, isNft), [text, isNft]);

  // Sum all valid amounts for balance checks and simulation. Errors in
  // individual rows don't prevent the rest from being counted.
  let totalAmount = BigInt(0);
  for (const r of parsed.valid) {
    try {
      totalAmount += parseAmount(r.amount);
    } catch {
      // ignore rows that fail to parse (shouldn't happen if parseRecipients
      // already validated them, but guards against edge cases)
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
  // All conditions must pass before the Send batch button is enabled:
  //   • At least one valid recipient
  //   • No parse errors in any line
  //   • Balance not exceeded
  //   • Enough ETH for the fee
  //   • For NFTs: isApprovedForAll must be true
  //   (ERC20 needsApproval is handled separately — it blocks the button but
  //    the approve button appears above it instead of gating canSubmit)
  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverBalance && !isOverNativeBalance
    && (!isNft || (isApprovedForAll ?? false));

  // ── Simulation ───────────────────────────────────────────────────────────────
  // Dry-runs the contract call so the user can inspect the raw transaction
  // object before signing. Only runs when "Request" is toggled and there are
  // valid recipients. For ERC20, simulation is skipped while approval is still
  // needed — the call would revert anyway.
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
          value: fee,
          query: { enabled: simulateEnabled },
        }
      : token
      ? {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeToken",
          args: [token.address, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: fee,
          // Don't simulate if approval is still needed — the call would revert.
          query: { enabled: simulateEnabled && totalAmount > 0n && !needsApproval },
        }
      : {
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeEther",
          args: [{ txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
          value: totalAmount + fee,
          query: { enabled: simulateEnabled && totalAmount > 0n },
        }
  );

  // ── handleSubmit ─────────────────────────────────────────────────────────────
  // Dispatches to the correct BatchDistributor function based on the current
  // mode. Mirrors the same 3-way branch as the simple editor's onSubmit.
  const handleSubmit = async () => {
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

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* ── CodeMirror editor ─────────────────────────────────────────────────
          Lazy-loaded to keep the initial bundle small. The Suspense fallback
          is a same-height pulse so the layout doesn't shift on load.
          Line wrapping is enabled so long addresses don't overflow.
          Placeholder adapts to the current mode (ETH / ERC20 / NFT). */}
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

      {/* ── Parse status ──────────────────────────────────────────────────────
          Only shown once the user has typed something. Reports the valid count
          in green, then any per-line parse errors in red, then balance errors.
          All errors must be resolved before Send batch is enabled. */}
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

      {/* ── Send Batch Info ───────────────────────────────────────────────────
          Summary strip: Reset button + Balance / Batch / Fee / Total rows.
          Total row is only shown for native ETH (token sends don't add ETH
          amounts to the fee in the same line). */}
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
            the formatted sum of all valid amounts. */}
        <div className="flex flex-row items-center justify-between text-xs">
          <p className="text-muted-foreground">Batch</p>
          {isNft
            ? <p>{parsed.valid.length} {symbol}</p>
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
        {token && (isNft ? !(isApprovedForAll ?? false) : needsApproval) && (
          <Button
            type="button"
            variant="outline"
            className="rounded-none w-full hover:cursor-pointer"
            disabled={approveWrite.isPending || isApproveConfirming}
            onClick={async () => {
              try {
                if (isNft) {
                  // ERC721: grant the BatchDistributor operator rights over all
                  // tokens in this collection.
                  await approveWrite.mutateAsync({
                    address: token.address,
                    abi: erc721Abi,
                    functionName: "setApprovalForAll",
                    args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true],
                  });
                } else {
                  // ERC20: approve the exact amount required for this batch.
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
            // ERC20: also blocked when approval is still pending, even if
            // canSubmit is true, to prevent sending before the approve confirms.
            disabled={!canSubmit || (!isNft && needsApproval) || isPending}
            onClick={handleSubmit}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
          </Button>
        </div>
      </div>

      {/* ── Transaction object preview ────────────────────────────────────────
          Shown when the user clicks "Request". Displays the raw calldata,
          value, and other fields from the simulated transaction. */}
      {showTxObject && (
        <TransactionObject
          transactionObject={simulatedTx?.request ?? null}
          isLoading={isLoadingSimulate}
          isError={isErrorSimulate}
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
          confirmed state persist even after the form is reset. */}
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
