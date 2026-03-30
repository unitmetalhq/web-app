import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Search, Plus, X, Eraser } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, erc721Abi, maxUint256, type Address } from "viem";
import { useEnsAddress, useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { normalize } from "viem/ens";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { BatchEditorProps } from "@/lib/send-batch-utils";

// ── BatchSimpleEditor ─────────────────────────────────────────────────────────
//
// Row-by-row form editor for batch sends. Supports three modes depending on
// what the parent passes in:
//   • Native ETH  — no `token` prop
//   • ERC20 token — `token` with isNft = false (2-step: approve → send)
//   • ERC721 NFT  — `token` with isNft = true  (2-step: setApprovalForAll → send)
//
// The action section at the bottom adapts its layout accordingly:
//   • Native: single-step, no approval needed
//   • ERC20/ERC721: numbered 2-step grid (step badge | action)

export function BatchSimpleEditor({
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

  // ── Contract writes ──────────────────────────────────────────────────────────
  // Two separate write hooks so approval and distribution have independent
  // pending/confirmed state — they are shown in separate TransactionStatus rows.
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

  // ── Form ─────────────────────────────────────────────────────────────────────
  // TanStack Form manages the dynamic recipient list. onSubmit dispatches to
  // the correct BatchDistributor function based on the current mode.
  const form = useForm({
    defaultValues: {
      recipients: [{ address: "", amount: "" }],
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const addresses = value.recipients.map((r) => r.address as Address);
        const amounts = value.recipients.map((r) => parseAmount(r.amount));

        if (atomicBatchSupported) {
          // EIP-5792 wallet_sendCalls — TBD
        } else if (isNft && token) {
          // ERC721: distributeNft(tokenAddress, { txns: [{recipient, tokenId}] })
          // The amount field here carries the token ID, not a fungible quantity.
          await writeContract.mutateAsync({
            address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
            abi: BatchDistributorAbi,
            functionName: "distributeNft",
            args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
            value: fee,
          });
        } else if (token) {
          // ERC20: distributeToken(tokenAddress, { txns: [{recipient, amount}] })
          // Requires prior approval for at least totalAmount.
          await writeContract.mutateAsync({
            address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
            abi: BatchDistributorAbi,
            functionName: "distributeToken",
            args: [token.address, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: amounts[i] })) }],
            value: fee,
          });
        } else {
          // Native ETH: distributeEther({ txns: [{recipient, amount}] })
          // msg.value must cover the sum of all amounts plus the protocol fee.
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
    },
  });

  // ── Uniform amount ───────────────────────────────────────────────────────────
  // When enabled, changing the first recipient's amount propagates to all
  // others. Hidden for NFTs since each token ID must be unique.
  const [uniformAmount, setUniformAmount] = useState(false);

  // Subscribe to the recipients array from the form store so derived values
  // (totalAmount, balance checks) stay reactive to every keystroke.
  const recipients = useStore(form.store, (state) => state.values.recipients);

  useEffect(() => {
    if (!uniformAmount) return;
    const first = recipients[0]?.amount ?? "";
    recipients.forEach((r, i) => {
      if (i > 0 && r.amount !== first) {
        form.setFieldValue(`recipients[${i}].amount`, first);
      }
    });
  }, [uniformAmount, recipients, form]);

  // Sum all currently entered amounts, ignoring rows with parse errors so
  // the UI doesn't break while the user is mid-typing.
  let totalAmount = BigInt(0);
  for (const r of recipients) {
    try {
      if (r.amount) totalAmount += parseAmount(r.amount);
    } catch {
      // ignore parse errors while typing
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
  // isOverBalance  — the send amount exceeds the token/ETH balance
  // isOverNativeBalance — the wallet doesn't even have enough ETH to cover the fee
  const isOverBalance = isNft
    ? false // NFTs don't have a fungible balance to check against
    : token
    ? (token.balance !== undefined && totalAmount > token.balance)
    : (nativeBalance ? totalAmount + fee > nativeBalance.value : false);
  const isOverNativeBalance = nativeBalance ? fee > nativeBalance.value : false;

  // ── Simulation ───────────────────────────────────────────────────────────────
  // Dry-runs the contract call so the user can inspect the raw transaction
  // object before signing. Only runs when the "Request" button is toggled on
  // and all addresses are filled in.
  const simulatedAddresses = recipients.map((r) => r.address as Address);
  const simulatedAmounts = recipients.map((r) => {
    try {
      return parseAmount(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const simulateEnabled = showTxObject && simulatedAddresses.every((a) => !!a) && simulatedAmounts.length > 0;
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

  const isBalanceLoading = token ? token.isLoading : isLoadingNativeBalance;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-3 mt-2">
        {/* ── Uniform amount toggle ─────────────────────────────────────────────
            Syncs all amount fields to the first row's value. Hidden for NFTs
            because each token ID must be distinct. */}
        {!isNft && (
          <div className="flex items-center gap-2">
            <Switch
              id="uniform-amount"
              checked={uniformAmount}
              onCheckedChange={setUniformAmount}
              className="rounded-none **:data-[slot=switch-thumb]:rounded-none"
            />
            <Label htmlFor="uniform-amount" className="text-xs cursor-pointer">
              Same amount for all
            </Label>
          </div>
        )}

        {/* ── Column headers ────────────────────────────────────────────────────
            Only visible on md+ screens where the inputs sit side by side.
            The amount label changes to "Token ID" in NFT mode. */}
        <div className="hidden md:grid grid-cols-[1fr_9rem_2rem] gap-1 text-xs text-muted-foreground px-1">
          <span>Address</span>
          <span>{isNft ? "Token ID" : `Amount (${symbol})`}</span>
          <span />
        </div>

        {/* ── Recipient rows ────────────────────────────────────────────────────
            TanStack Form array field — each row has its own address + amount
            field with inline validation. The address field also supports ENS
            lookup (handled inside RecipientRow). */}
        <form.Field name="recipients" mode="array">
          {(field) => (
            <div className="flex flex-col divide-y divide-border md:divide-y-0 gap-0 md:gap-2">
              {field.state.value.map((_, i) => (
                <form.Field
                  key={i}
                  name={`recipients[${i}].address`}
                  validators={{
                    onChange: ({ value }: { value?: string }) =>
                      !value ? "Please enter an address or ENS" : undefined,
                  }}
                >
                  {(addressField: AnyFieldApi) => (
                    <form.Field
                      name={`recipients[${i}].amount`}
                      validators={{
                        onChange: ({ value }: { value?: string }) => {
                          if (!value) return isNft ? "Please enter a token ID" : "Please enter an amount";
                          if (isNft) {
                            // Token IDs must be non-negative integers — no decimals.
                            if (!/^\d+$/.test(value)) return "Token ID must be a non-negative integer";
                            return undefined;
                          }
                          const n = parseFloat(value);
                          if (isNaN(n)) return "Invalid number";
                          if (n <= 0) return "Must be > 0";
                          try {
                            parseAmount(value);
                          } catch {
                            // parseUnits throws if the value has more decimal
                            // places than the token supports.
                            return token ? "Too many decimal places" : "Invalid format";
                          }
                          return undefined;
                        },
                      }}
                    >
                      {(amountField: AnyFieldApi) => (
                        <RecipientRow
                          addressField={addressField}
                          amountField={amountField}
                          isOnly={field.state.value.length === 1}
                          onRemove={() => field.removeValue(i)}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Field>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none hover:cursor-pointer w-full"
                onClick={() => field.pushValue({ address: "", amount: "" })}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add recipient
              </Button>
            </div>
          )}
        </form.Field>

        {/* ── Balance error banners ─────────────────────────────────────────────
            Shown inline, above the summary, so the user knows why Send is
            disabled before they scroll down. */}
        {isOverBalance && (
          <p className="text-red-400 text-xs">Total amount exceeds balance</p>
        )}
        {isOverNativeBalance && (
          <p className="text-red-400 text-xs">Insufficient ETH for fee</p>
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
              onClick={() => form.reset()}
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
          {/* Batch — for NFTs shows the count of filled rows; for fungibles
              shows the formatted sum of all amounts. */}
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Batch</p>
            {isNft
              ? <p>{recipients.filter(r => r.amount).length} {symbol}</p>
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

        {/* ── Action section ────────────────────────────────────────────────────
            Rendered inside form.Subscribe so it re-renders only when canSubmit
            changes, avoiding unnecessary re-renders of the entire form.

            Three layouts depending on mode:
              1. NFT (ERC721)  — 2-step grid: [setApprovalForAll] → [send]
              2. Native ETH    — single step: [Request] [Send batch]
              3. ERC20 token   — 2-step grid: [approve exact | unlimited] → [send]

            The numbered step badge turns green once that step is complete.
            The grid layout (badge col | content col) ensures TransactionStatus
            aligns under the button without hardcoded margins. */}
        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => {
            const isApproving = approveWrite.isPending || isApproveConfirming;
            const isDistributing = writeContract.isPending || isConfirming;
            const isAllowanceSufficient = !needsApproval;
            const canSend = canSubmit && !isOverBalance && !isOverNativeBalance && !isDistributing;

            // ── NFT flow (ERC721) ──────────────────────────────────────────────
            if (isNft && token) {
              const approved = isApprovedForAll ?? false;
              const canApproveNft = canSubmit && !isApproving && !approved;
              const canSendNft = canSend && approved;
              return (
                <div className="flex flex-col gap-4">
                  {/* step 1 — setApprovalForAll grants the BatchDistributor
                      operator rights over all NFTs in this collection. The
                      badge turns green once confirmed. */}
                  <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${approved ? "border-green-500 text-green-500" : "border-muted-foreground text-muted-foreground"}`}>
                      1
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none flex-1 hover:cursor-pointer"
                      disabled={!canApproveNft || approved}
                      onClick={async () => {
                        try {
                          await approveWrite.mutateAsync({
                            address: token.address,
                            abi: erc721Abi,
                            functionName: "setApprovalForAll",
                            args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true],
                          });
                        } catch {
                          // user rejected or tx failed — errors surfaced by wallet
                        }
                      }}
                    >
                      {isApproving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Approve for all
                    </Button>
                    {/* The empty <div /> keeps TransactionStatus in the content
                        column, aligned under the button rather than the badge. */}
                    {(approveWrite.data || approveWrite.isPending || isApproveConfirming) && (
                      <>
                        <div />
                        <TransactionStatus
                          isPending={approveWrite.isPending}
                          isConfirming={isApproveConfirming}
                          isConfirmed={isApproveConfirmed}
                          txHash={approveWrite.data}
                          blockExplorerUrl={blockExplorerUrl}
                        />
                      </>
                    )}
                  </div>
                  {/* step 2 — send. Disabled until approval is confirmed. */}
                  <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${approved ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
                      2
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-none hover:cursor-pointer"
                        disabled={!canSendNft}
                        onClick={() => setShowTxObject((prev) => !prev)}
                      >
                        Request
                      </Button>
                      <Button
                        type="submit"
                        className="rounded-none hover:cursor-pointer"
                        disabled={!canSendNft}
                      >
                        {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
                      </Button>
                    </div>
                    <div />
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
                </div>
              );
            }

            // ── Native ETH flow ────────────────────────────────────────────────
            // No approval step needed — just Request + Send.
            if (!token) {
              return (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none hover:cursor-pointer"
                      disabled={!canSend}
                      onClick={() => setShowTxObject((prev) => !prev)}
                    >
                      Request
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-none hover:cursor-pointer"
                      disabled={!canSend}
                    >
                      {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
                    </Button>
                  </div>
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

            // ── ERC20 flow ─────────────────────────────────────────────────────
            // Two approval options: exact (tight, re-approval needed next time
            // the amount changes) or unlimited (maxUint256, one-time approval).
            const canApprove = canSubmit && !isApproving && needsApproval;
            const canSendToken = canSend && isAllowanceSufficient;

            return (
              <div className="flex flex-col gap-4">
                {/* step 1 — approve. Badge turns green once allowance covers
                    the total, regardless of which approve variant was used. */}
                <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                  <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${isAllowanceSufficient ? "border-green-500 text-green-500" : "border-muted-foreground text-muted-foreground"}`}>
                    1
                  </span>
                  <div className="flex flex-row gap-2">
                    {/* Exact approval: sets allowance to exactly the current
                        totalAmount. Safer but requires re-approval if the
                        amount changes. */}
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none flex-1 hover:cursor-pointer"
                      disabled={!canApprove || isAllowanceSufficient}
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
                      {isApproving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Approve exact
                    </Button>
                    {/* Unlimited approval: sets allowance to maxUint256.
                        Convenient for repeated use but grants broader access. */}
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none flex-1 hover:cursor-pointer"
                      disabled={!canApprove}
                      onClick={async () => {
                        try {
                          await approveWrite.mutateAsync({
                            address: token.address,
                            abi: erc20Abi,
                            functionName: "approve",
                            args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, maxUint256],
                          });
                        } catch {
                          // user rejected or tx failed — errors surfaced by wallet
                        }
                      }}
                    >
                      Approve unlimited
                    </Button>
                  </div>
                  {(approveWrite.data || approveWrite.isPending || isApproveConfirming) && (
                    <>
                      <div />
                      <TransactionStatus
                        isPending={approveWrite.isPending}
                        isConfirming={isApproveConfirming}
                        isConfirmed={isApproveConfirmed}
                        txHash={approveWrite.data}
                        blockExplorerUrl={blockExplorerUrl}
                      />
                    </>
                  )}
                </div>

                {/* step 2 — send. Disabled until allowance is sufficient. */}
                <div className="grid grid-cols-[1.25rem_1fr] gap-x-4 gap-y-2 items-start">
                  <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center mt-0.5 ${isAllowanceSufficient ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
                    2
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-none hover:cursor-pointer"
                      disabled={!canSendToken}
                      onClick={() => setShowTxObject((prev) => !prev)}
                    >
                      Request
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-none hover:cursor-pointer"
                      disabled={!canSendToken}
                    >
                      {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
                    </Button>
                  </div>
                  <div />
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
              </div>
            );
          }}
        </form.Subscribe>

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
      </div>
    </form>
  );
}

// ── RecipientRow ──────────────────────────────────────────────────────────────
//
// A single row in the recipient list. Renders an address input with an ENS
// lookup button and an amount/tokenId input, plus a remove button.
//
// ENS resolution is manual (triggered by the search button) rather than
// automatic on every keystroke to avoid hammering the RPC. When a resolved
// address comes back, it replaces the ENS name in the field so downstream
// code always works with a raw hex address.

function RecipientRow({
  addressField,
  amountField,
  isOnly,
  onRemove,
}: {
  addressField: AnyFieldApi;
  amountField: AnyFieldApi;
  // Disables the remove button when this is the last remaining row.
  isOnly: boolean;
  onRemove: () => void;
}) {
  const address = addressField.state.value as string;

  // ENS lookup — only resolves .eth names; query is disabled by default and
  // triggered manually so the user controls when the RPC call fires.
  const {
    data: ensAddress,
    isLoading: isLoadingEns,
    isError: isErrorEns,
    refetch: refetchEns,
  } = useEnsAddress({
    chainId: 1,
    name:
      address && address.endsWith(".eth") && address.split(".")[0] !== ""
        ? normalize(address)
        : undefined,
    query: { enabled: false },
  });

  // Once ENS resolves, replace the typed name with the resolved hex address.
  useEffect(() => {
    if (ensAddress) {
      addressField.handleChange(ensAddress);
    }
  }, [ensAddress, addressField]);

  return (
    <div className="grid grid-cols-[1fr_2rem] md:grid-cols-[1fr_9rem_2rem] gap-1 items-start py-3 md:py-0">
      {/* address + inline status hint */}
      <div className="col-span-2 md:col-span-1 flex flex-col gap-0.5">
        <InputGroup>
          <InputGroupInput
            value={addressField.state.value}
            onChange={(e) => addressField.handleChange(e.target.value)}
            placeholder="0x... or ENS"
            className="rounded-none h-8 text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="ENS lookup"
              size="icon-xs"
              onClick={() => refetchEns()}
              className="hover:cursor-pointer"
            >
              {isLoadingEns ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <AddressRowStatus
          field={addressField}
          ensAddress={ensAddress}
          isLoadingEns={isLoadingEns}
          isErrorEns={isErrorEns}
        />
      </div>

      {/* amount / token ID + inline status hint */}
      <div className="flex flex-col gap-0.5">
        <Input
          value={amountField.state.value}
          onChange={(e) => amountField.handleChange(e.target.value)}
          placeholder="0.0"
          type="number"
          inputMode="decimal"
          className="rounded-none h-8 text-xs"
        />
        <AmountRowStatus field={amountField} />
      </div>

      {/* remove row — disabled when this is the only row */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none h-8 w-8 hover:cursor-pointer"
        disabled={isOnly}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

// ── AddressRowStatus ──────────────────────────────────────────────────────────
//
// Displays a contextual hint below the address input:
//   • Untouched   → neutral hint
//   • Invalid     → validation error (red if it's more than "please fill in")
//   • ENS loading → skeleton
//   • ENS error   → red error
//   • ENS resolved → resolved address in green
//   • ENS not found (null) → red "Invalid ENS"
//   • Plain address valid → green "ok!"

function AddressRowStatus({
  field,
  ensAddress,
  isLoadingEns,
  isErrorEns,
}: {
  field: AnyFieldApi;
  ensAddress?: Address | null;
  isLoadingEns: boolean;
  isErrorEns: boolean;
}) {
  if (!field.state.meta.isTouched) {
    return <em className="text-xs">Enter address or ENS</em>;
  }
  if (!field.state.meta.isValid) {
    return (
      <em
        className={`text-xs ${field.state.meta.errors.join(",") === "Please enter an address or ENS"
          ? ""
          : "text-red-400"
          }`}
      >
        {field.state.meta.errors.join(",")}
      </em>
    );
  }
  if (isLoadingEns) return <Skeleton className="w-16 h-3" />;
  if (isErrorEns) return <span className="text-red-400 text-xs">ENS failed</span>;
  if (ensAddress) return <em className="text-green-500 text-xs truncate block">{ensAddress}</em>;
  if (ensAddress === null) return <span className="text-red-400 text-xs">Invalid ENS</span>;
  return <em className="text-green-500 text-xs">ok!</em>;
}

// ── AmountRowStatus ───────────────────────────────────────────────────────────
//
// Displays a contextual hint below the amount / token ID input:
//   • Untouched → neutral hint
//   • Invalid   → validation error (red for real errors, neutral for empty)
//   • Valid     → green "ok!"

function AmountRowStatus({ field }: { field: AnyFieldApi }) {
  if (!field.state.meta.isTouched) {
    return <em className="text-xs">Enter amount</em>;
  }
  if (!field.state.meta.isValid) {
    return (
      <em
        className={`text-xs ${field.state.meta.errors.join(",") === "Please enter an amount"
          ? ""
          : "text-red-400"
          }`}
      >
        {field.state.meta.errors.join(",")}
      </em>
    );
  }
  return <em className="text-green-500 text-xs">ok!</em>;
}
