import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Check, Search, Eraser } from "lucide-react";
import { parseEther, formatEther, stringToHex, type Address } from "viem";
import {
  useConfig,
  useBalance,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useEnsAddress,
  useConnection,
  usePrepareTransactionRequest,
} from "wagmi";
import { normalize } from "viem/ens";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useIsViewOnly } from "@/hooks/use-is-view-only";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { RefreshCcw } from "lucide-react";
import { TransactionObject } from "@/components/transaction-object";
import { TransactionStatus } from "@/components/transaction-status";
import { Kbd } from "@/components/ui/kbd";

export default function SendNativeTokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  // get Wagmi config
  const config = useConfig();

  // check if desktop
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const isViewOnly = useIsViewOnly();;

  // get connection
  const connection = useConnection()

  // send form
  const form = useForm({
    defaultValues: {
      receivingAddress: "",
      amount: "",
      type: "native",
      message: "",
    },
    onSubmit: async ({ value }) => {
      // console.log(value);

      if (value.type === "native") {

        // resolve ENS to address if needed
        let recipientAddress: Address;
        if (value.receivingAddress.endsWith(".eth")) {
          // Get the resolved ENS address from the form state
          // We need to resolve it here if not already resolved
          if (!ensAddress) {
            console.error("ENS address not resolved");
            return;
          }
          recipientAddress = ensAddress as Address;
        } else {
          recipientAddress = value.receivingAddress as Address;
        }

        // execute the send native transaction
        sendNativeTransaction({
          to: recipientAddress,
          value: parseEther(value.amount),
          chainId: connection.chain?.id || undefined,
          data: value.message ? stringToHex(value.message) : undefined,
        });
      }
    },
  });

  // show/hide prepared transaction object
  const [showTxObject, setShowTxObject] = useState(false);

  // get form values reactively
  const receivingAddress = useStore(
    form.store,
    (state) => state.values.receivingAddress || ""
  );
  // get amount values
  const amount = useStore(form.store, (state) => state.values.amount || "");
  // get message values
  const message = useStore(form.store, (state) => state.values.message || "");

  // get ENS address
  const {
    data: ensAddress,
    isLoading: isLoadingEnsAddress,
    isError: isErrorEnsAddress,
    refetch: refetchEnsAddress,
  } = useEnsAddress({
    chainId: 1,
    name: receivingAddress && receivingAddress.endsWith(".eth") && (receivingAddress.split(".")[0] !== "" || receivingAddress.split(".")[1] !== "")
      ? normalize(receivingAddress)
      : undefined,
    query: {
      enabled: false,
    },
  });

  // resolve recipient address (ENS or raw)
  const resolvedRecipient = receivingAddress.endsWith(".eth")
    ? (ensAddress ?? undefined)
    : (receivingAddress as Address) || undefined;

  // safely parse amount to avoid throwing on invalid input
  let parsedAmount: bigint | undefined;
  try {
    parsedAmount = amount ? parseEther(amount) : undefined;
  } catch {
    parsedAmount = undefined;
  }

  // prepare transaction request
  const {
    data: preparedTx,
    isLoading: isLoadingPreparedTx,
    isError: isErrorPreparedTx,
  } = usePrepareTransactionRequest({
    to: resolvedRecipient,
    value: parsedAmount,
    data: message ? stringToHex(message) : undefined,
    chainId: connection.chain?.id || undefined,
    query: {
      enabled: !!resolvedRecipient && !!parsedAmount,
    },
  });

  // check if balance query should be enabled
  const isBalanceQueryEnabled = !!connection.chain && !!connection.address;

  // get native balance
  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useBalance({
    query: {
      enabled: isBalanceQueryEnabled,
    },
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
  });

  // hook to send native transaction
  const {
    data: sendNativeTransactionHash,
    isPending: isPendingSendNativeTransaction,
    sendTransaction: sendNativeTransaction,
    reset: resetSendNativeTransaction,
  } = useSendTransaction();

  // hook to wait for transaction receipt
  const {
    isLoading: isConfirmingSendNativeTransaction,
    isSuccess: isConfirmedSendNativeTransaction,
  } = useWaitForTransactionReceipt({
    hash: sendNativeTransactionHash,
    chainId: selectedChain || undefined,
  });

  const selectedChainBlockExplorer = config.chains.find(
    (chain) => chain.id.toString() === selectedChain?.toString()
  )?.blockExplorers?.default.url;

  function handleReset() {
    resetSendNativeTransaction();
    form.reset();
  }

  // Handle keyboard ENS lookup
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        refetchEnsAddress();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refetchEnsAddress]);

  // Handle keyboard shortcut for Request (toggle tx object)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setShowTxObject((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    // reset the transaction state
    resetSendNativeTransaction();

    // reset the form values
    form.reset();

    // refetch the native balance
    refetchNativeBalance();
  }, [selectedChain, resetSendNativeTransaction, form, refetchNativeBalance]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-4">
        {/* send native form*/}
        <div>
          <form.Field
            name="amount"
            validators={{
              onChange: ({ value }) => {
                // Check if empty
                if (!value) {
                  return "Please enter an amount to send";
                }

                // Convert to number and check if it's valid
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                  return "Please enter a valid number";
                }

                // Check if negative
                if (numValue <= 0) {
                  return "Amount must be greater than 0";
                }

                // Try to parse ether and check balance
                try {
                  const valueInWei = parseEther(value);
                  if (
                    nativeBalance?.value &&
                    valueInWei > nativeBalance.value
                  ) {
                    return "Insufficient balance";
                  }
                } catch {
                  // Handle parseEther errors for invalid decimal places
                  return "Invalid amount format";
                }

                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-0">
                <div className="flex flex-row gap-2 items-center justify-between">
                  <p className="text-muted-foreground">Amount</p>
                  <div className="flex flex-row gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        field.handleChange(
                          formatEther(
                            (nativeBalance?.value || BigInt(0)) / BigInt(4)
                          )
                        )
                      }
                      className="hover:cursor-pointer underline underline-offset-4"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        field.handleChange(
                          formatEther(
                            (nativeBalance?.value || BigInt(0)) / BigInt(2)
                          )
                        )
                      }
                      className="hover:cursor-pointer underline underline-offset-4"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        field.handleChange(
                          formatEther(
                            ((nativeBalance?.value || BigInt(0)) * BigInt(3)) /
                            BigInt(4)
                          )
                        )
                      }
                      className="hover:cursor-pointer underline underline-offset-4"
                    >
                      75%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        field.handleChange(
                          formatEther(
                            nativeBalance?.value || BigInt(0)
                          ) as string
                        )
                      }
                      className="hover:cursor-pointer underline underline-offset-4"
                    >
                      Max
                    </button>
                  </div>
                </div>
                <div className="flex flex-row items-center justify-between my-2">
                  {isDesktop ? (
                    <input
                      id={field.name}
                      name={field.name}
                      value={field.state.value || ""}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-transparent text-2xl outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      placeholder="0"
                      required
                    />
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      value={field.state.value || ""}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-transparent text-2xl outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      type="number"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      placeholder="0"
                      required
                    />
                  )}
                </div>
                <div className="flex flex-row items-center justify-between">
                  <div className="flex flex-row gap-2">
                    <div className="text-muted-foreground">
                      {isBalanceQueryEnabled && isLoadingNativeBalance ? (
                        <Skeleton className="w-10 h-4" />
                      ) : (
                        formatEther(nativeBalance?.value || BigInt(0))
                      )}
                    </div>
                    {selectedChain ? (
                      <p className="text-muted-foreground">
                        {config.chains.find(
                          (c) => c.id.toString() === selectedChain?.toString()
                        )?.nativeCurrency.symbol || "Native"}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">Native</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none hover:cursor-pointer"
                    type="button"
                    onClick={() => refetchNativeBalance()}
                  >
                    {isBalanceQueryEnabled && isLoadingNativeBalance ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCcw />
                    )}
                  </Button>
                </div>
                <AmountFieldInfo field={field} />
              </div>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field
            name="receivingAddress"
            validators={{
              onChange: ({ value }) => {
                if (!value) {
                  return "Please enter an address or ENS";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-2 items-center">
                  <p className="text-muted-foreground">Recipient</p>
                  <Kbd>Ctrl + S</Kbd>
                </div>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    name={field.name}
                    value={field.state.value || ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="rounded-none"
                    type="text"
                    placeholder="Address (0x...) or ENS (.eth)"
                    required
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label="ENS lookup"
                      title="Copy"
                      size="icon-xs"
                      onClick={() => refetchEnsAddress()}
                      className="hover:cursor-pointer"
                    >
                      {isLoadingEnsAddress ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <ReceivingAddressFieldInfo
                  field={field}
                  ensAddress={ensAddress}
                  isLoadingEnsAddress={isLoadingEnsAddress}
                  isErrorEnsAddress={isErrorEnsAddress}
                />
              </div>
            )}
          </form.Field>
        </div>
        <div>
          <form.Field name="message">
            {(field) => (
              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-2 items-center justify-between">
                  <p className="text-muted-foreground">Message</p>
                </div>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value || ""}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="rounded-none"
                  type="text"
                  placeholder="Optional message"
                />
              </div>
            )}
          </form.Field>
        </div>
        <div className="flex flex-col gap-2">
          <form.Subscribe
            selector={(state) => [
              state.canSubmit,
              isPendingSendNativeTransaction,
              isConfirmingSendNativeTransaction,
            ]}
          >
            {([
              canSubmit,
              isPendingSendNativeTransaction,
              isConfirmingSendNativeTransaction,
            ]) => (
              <div className="grid grid-cols-5 gap-2">
                <Button
                  className="hover:cursor-pointer rounded-none col-span-1"
                  variant="outline"
                  size="icon"
                  type="reset"
                  disabled={
                    !canSubmit ||
                    isPendingSendNativeTransaction ||
                    isConfirmingSendNativeTransaction
                  }
                  onClick={handleReset}
                >
                  <Eraser className="w-4 h-4" />
                </Button>
                {isViewOnly ? (
                  // View-only: single Request button spanning remaining columns
                  <Button
                    className="hover:cursor-pointer rounded-none col-span-4"
                    variant="outline"
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => setShowTxObject((prev) => !prev)}
                  >
                    Request <Kbd>T</Kbd>
                  </Button>
                ) : (
                  <>
                    <Button
                      className="hover:cursor-pointer rounded-none col-span-2"
                      variant="outline"
                      type="button"
                      disabled={
                        !canSubmit ||
                        isPendingSendNativeTransaction ||
                        isConfirmingSendNativeTransaction
                      }
                      onClick={() => setShowTxObject((prev) => !prev)}
                    >
                      Request <Kbd>T</Kbd>
                    </Button>
                    <Button
                      className="hover:cursor-pointer rounded-none col-span-2"
                      type="submit"
                      disabled={
                        !canSubmit ||
                        isPendingSendNativeTransaction ||
                        isConfirmingSendNativeTransaction
                      }
                    >
                      {isPendingSendNativeTransaction ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isConfirmingSendNativeTransaction ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isConfirmedSendNativeTransaction ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <>Send</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}
          </form.Subscribe>
          {showTxObject && (
            <TransactionObject
              transactionObject={preparedTx}
              isLoading={isLoadingPreparedTx}
              isError={isErrorPreparedTx}
            />
          )}
          <TransactionStatus
            isPending={isPendingSendNativeTransaction}
            isConfirming={isConfirmingSendNativeTransaction}
            isConfirmed={isConfirmedSendNativeTransaction}
            txHash={sendNativeTransactionHash}
            blockExplorerUrl={selectedChainBlockExplorer}
          />
        </div>
      </div>
    </form>
  );
}

function AmountFieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {!field.state.meta.isTouched ? (
        <em>Please enter an amount to send</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${field.state.meta.errors.join(",") ===
            "Please enter an amount to send"
            ? ""
            : "text-red-400"
            }`}
        >
          {field.state.meta.errors.join(",")}
        </em>
      ) : (
        <em className="text-green-500">ok!</em>
      )}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}

function ReceivingAddressFieldInfo({
  field,
  ensAddress,
  isLoadingEnsAddress,
  isErrorEnsAddress,
}: {
  field: AnyFieldApi;
  ensAddress?: Address | null;
  isLoadingEnsAddress?: boolean;
  isErrorEnsAddress?: boolean;
}) {
  return (
    <>
      {!field.state.meta.isTouched ? (
        <em>Please enter an address or ENS</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${field.state.meta.errors.join(",") ===
            "Please enter an address or ENS"
            ? ""
            : "text-red-400"
            }`}
        >
          {field.state.meta.errors.join(",")}
        </em>
      ) : isLoadingEnsAddress ? (
        <Skeleton className="w-10 h-4" />
      ) : isErrorEnsAddress ? (
        <div className="text-red-400 text-xs">Failed to resolve ENS</div>
      ) : ensAddress ? (
        <em className="text-green-500 text-xs">{ensAddress}</em>
      ) : ensAddress === null ? (
        <div className="text-red-400 text-xs">Invalid ENS</div>
      ) : (
        <em className="text-green-500">ok!</em>
      )}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}