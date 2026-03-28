import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Search, Plus, X, Eraser } from "lucide-react";
import { parseEther, formatEther, parseUnits, formatUnits, erc20Abi, maxUint256, type Address } from "viem";
import { useEnsAddress, useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract, useReadContract, useConnection } from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS, BATCH_DISTRIBUTOR_FEE } from "@/lib/constants";
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

export function BatchSimpleEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
  token,
}: BatchEditorProps) {
  const config = useConfig();
  const connection = useConnection();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const approveWrite = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveWrite.data });

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
    },
  });

  const [uniformAmount, setUniformAmount] = useState(false);

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

  let totalAmount = BigInt(0);
  for (const r of recipients) {
    try {
      if (r.amount) totalAmount += parseAmount(r.amount);
    } catch {
      // ignore parse errors while typing
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

  // Simulate
  const simulatedAddresses = recipients.map((r) => r.address as Address);
  const simulatedAmounts = recipients.map((r) => {
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
        query: { enabled: showTxObject && simulatedAddresses.every((a) => !!a) && totalAmount > 0n && !needsApproval },
      }
      : {
        address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
        abi: BatchDistributorAbi,
        functionName: "distributeEther",
        args: [{ txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedAmounts[i] })) }],
        value: totalAmount + BATCH_DISTRIBUTOR_FEE,
        query: { enabled: showTxObject && simulatedAddresses.every((a) => !!a) && totalAmount > BigInt(0) },
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
        {/* uniform amount toggle */}
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

        {/* column headers */}
        <div className="hidden md:grid grid-cols-[1fr_9rem_2rem] gap-1 text-xs text-muted-foreground px-1">
          <span>Address</span>
          <span>Amount ({symbol})</span>
          <span />
        </div>

        {/* rows */}
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
                          if (!value) return "Please enter an amount";
                          const n = parseFloat(value);
                          if (isNaN(n)) return "Invalid number";
                          if (n <= 0) return "Must be > 0";
                          try {
                            parseAmount(value);
                          } catch {
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

        {isOverBalance && (
          <p className="text-red-400 text-xs">Total amount exceeds balance</p>
        )}
        {isOverNativeBalance && (
          <p className="text-red-400 text-xs">Insufficient ETH for fee</p>
        )}

        {/* ── Send Batch Info ───────────────────────────────── */}
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
          {/* balance + running total */}
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Balance</p>
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
          {/* Batch */}
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Batch</p>
            <p>{formatAmount(totalAmount)} {symbol}</p>
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

        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => {
            const isApproving = approveWrite.isPending || isApproveConfirming;
            const isDistributing = writeContract.isPending || isConfirming;
            const isAllowanceSufficient = !needsApproval;
            const canSend = canSubmit && !isOverBalance && !isOverNativeBalance && !isDistributing;

            if (!token) {
              return (
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
              );
            }

            const canApprove = canSubmit && !isApproving && needsApproval;
            const canSendToken = canSend && isAllowanceSufficient;

            return (
              <div className="flex flex-col gap-4">
                {/* step 1 — approve */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row items-center gap-4">
                    <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center ${isAllowanceSufficient ? "border-green-500 text-green-500" : "border-muted-foreground text-muted-foreground"}`}>
                      1
                    </span>
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
                    <div className="ml-9">
                      <TransactionStatus
                        isPending={approveWrite.isPending}
                        isConfirming={isApproveConfirming}
                        isConfirmed={isApproveConfirmed}
                        txHash={approveWrite.data}
                        blockExplorerUrl={blockExplorerUrl}
                      />
                    </div>
                  )}
                </div>

                {/* step 2 — send */}
                <div className="flex flex-row items-center gap-4">
                  <span className={`w-5 h-5 shrink-0 border text-xs flex items-center justify-center ${isAllowanceSufficient ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
                    2
                  </span>
                  <div className="grid grid-cols-2 gap-2 flex-1">
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
                </div>
              </div>
            );
          }}
        </form.Subscribe>

        {showTxObject && (
          <TransactionObject
            transactionObject={simulatedTx?.request ?? null}
            isLoading={isLoadingSimulate}
            isError={isErrorSimulate}
          />
        )}
        <div className="ml-9">
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
    </form>
  );
}

// ── RecipientRow ──────────────────────────────────────────────────────────────

function RecipientRow({
  addressField,
  amountField,
  isOnly,
  onRemove,
}: {
  addressField: AnyFieldApi;
  amountField: AnyFieldApi;
  isOnly: boolean;
  onRemove: () => void;
}) {
  const address = addressField.state.value as string;

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

  useEffect(() => {
    if (ensAddress) {
      addressField.handleChange(ensAddress);
    }
  }, [ensAddress, addressField]);

  return (
    <div className="grid grid-cols-[1fr_2rem] md:grid-cols-[1fr_9rem_2rem] gap-1 items-start py-3 md:py-0">
      {/* address + status */}
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

      {/* amount + status */}
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

      {/* remove */}
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
