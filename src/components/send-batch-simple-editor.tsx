"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Search, Plus, X, Wallet, Sigma, Eraser } from "lucide-react";
import { parseEther, formatEther, type Address } from "viem";
import { useEnsAddress, useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract } from "wagmi";
import { GASLITEDROP_CONTRACT_ADDRESS } from "@/lib/constants";
import { GasliteDropAbi } from "@/lib/abis/gaslite-drop-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
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
        className={`text-xs ${
          field.state.meta.errors.join(",") === "Please enter an address or ENS"
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
        className={`text-xs ${
          field.state.meta.errors.join(",") === "Please enter an amount"
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

// ── BatchSimpleEditor ─────────────────────────────────────────────────────────

export function BatchSimpleEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
}: BatchEditorProps) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const form = useForm({
    defaultValues: {
      recipients: [{ address: "", amount: "" }],
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const addresses = value.recipients.map((r) => r.address as Address);
        const amounts = value.recipients.map((r) => parseEther(r.amount));
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
      if (r.amount) totalAmount += parseEther(r.amount);
    } catch {
      // ignore parse errors while typing
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";

  const simulatedAddresses = recipients.map((r) => r.address as Address);
  const simulatedAmounts = recipients.map((r) => {
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
    query: { enabled: showTxObject && simulatedAddresses.every((a) => !!a) && totalAmount > BigInt(0) },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
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
                            parseEther(value);
                          } catch {
                            return "Invalid format";
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

        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <div className="grid grid-cols-5 gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-none hover:cursor-pointer col-span-1"
                onClick={() => form.reset()}
              >
                <Eraser className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-none hover:cursor-pointer col-span-2"
                disabled={!canSubmit || isOverBalance || writeContract.isPending || isConfirming}
                onClick={() => setShowTxObject((prev) => !prev)}
              >
                Request
              </Button>
              <Button
                type="submit"
                className="rounded-none hover:cursor-pointer col-span-2"
                disabled={!canSubmit || isOverBalance || writeContract.isPending || isConfirming}
              >
                {writeContract.isPending || isConfirming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Send batch"
                )}
              </Button>
            </div>
          )}
        </form.Subscribe>

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
    </form>
  );
}
