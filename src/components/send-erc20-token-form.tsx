import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Check, Search, Eraser } from "lucide-react";
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem";
import {
  useConfig,
  useWaitForTransactionReceipt,
  useEnsAddress,
  useReadContracts,
  useWriteContract,
  useConnection,
  useSimulateContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { normalize } from "viem/ens";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { RefreshCcw } from "lucide-react";
import { TransactionObject } from "@/components/transaction-object";
import { TransactionStatus } from "@/components/transaction-status";
import { Kbd } from "@/components/ui/kbd";
import { TokenPickerDialog, type TokenListToken } from "@/components/token-picker-dialog";

export default function SendErc20TokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  // get Wagmi config
  const config = useConfig();

  // check if desktop
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // get connection
  const connection = useConnection();

  // show/hide prepared transaction object
  const [showTxObject, setShowTxObject] = useState(false);

  // send form
  const form = useForm({
    defaultValues: {
      tokenAddress: "",
      receivingAddress: "",
      amount: "",
      type: "erc20",
    },
    onSubmit: async ({ value }) => {
      if (value.type === "erc20") {
        // resolve ENS to address if needed
        let recipientAddress: Address;
        if (value.receivingAddress.endsWith(".eth")) {
          if (!ensAddress) {
            console.error("ENS address not resolved");
            return;
          }
          recipientAddress = ensAddress as Address;
        } else {
          recipientAddress = value.receivingAddress as Address;
        }

        // execute the send erc20 transaction
        sendErc20Transaction({
          address: resolvedTokenAddress as Address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipientAddress, parseUnits(value.amount, tokenData?.[3]?.result || 18)],
          chainId: selectedChain || undefined,
        });
      }
    },
  });

  // get token address reactively from form store
  const tokenAddress = useStore(
    form.store,
    (state) => state.values.tokenAddress || ""
  );

  // get receiving address reactively from form store
  const receivingAddress = useStore(
    form.store,
    (state) => state.values.receivingAddress || ""
  );

  // get amount reactively from form store
  const amount = useStore(form.store, (state) => state.values.amount || "");

  // get ENS address for token
  const {
    data: tokenEnsAddress,
    isLoading: isLoadingTokenEnsAddress,
    isError: isErrorTokenEnsAddress,
    refetch: refetchTokenEnsAddress,
  } = useEnsAddress({
    chainId: 1,
    name:
      tokenAddress &&
      tokenAddress.endsWith(".eth") &&
      (tokenAddress.split(".")[0] !== "" || tokenAddress.split(".")[1] !== "")
        ? normalize(tokenAddress)
        : undefined,
    query: {
      enabled: false,
    },
  });

  // get ENS address for recipient
  const {
    data: ensAddress,
    isLoading: isLoadingEnsAddress,
    isError: isErrorEnsAddress,
    refetch: refetchEnsAddress,
  } = useEnsAddress({
    chainId: 1,
    name:
      receivingAddress &&
      receivingAddress.endsWith(".eth") &&
      (receivingAddress.split(".")[0] !== "" ||
        receivingAddress.split(".")[1] !== "")
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

  // resolve token address (ENS or raw)
  const resolvedTokenAddress = tokenAddress.endsWith(".eth")
    ? (tokenEnsAddress ?? undefined)
    : (tokenAddress as Address) || undefined;

  // check if balance query should be enabled
  const isBalanceQueryEnabled = !!connection.chain && !!connection.address;

  const {
    data: tokenData,
    isLoading: isLoadingTokenData,
    refetch: refetchTokenData,
  } = useReadContracts({
    contracts: [
      {
        address: resolvedTokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [connection.address as Address],
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc20Abi,
        functionName: "name",
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
        chainId: connection.chain?.id || undefined,
      },
    ],
    query: {
      enabled: isBalanceQueryEnabled && !!resolvedTokenAddress,
    },
  });

  // safely parse amount to avoid throwing on invalid input
  let parsedAmount: bigint | undefined;
  try {
    parsedAmount = amount
      ? parseUnits(amount, tokenData?.[3]?.result || 18)
      : undefined;
  } catch {
    parsedAmount = undefined;
  }

  // prepare transaction request
  const {
    data: preparedTx,
    isLoading: isLoadingPreparedTx,
    isError: isErrorPreparedTx,
  } = useSimulateContract({
    address: resolvedTokenAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args:
      resolvedRecipient && parsedAmount !== undefined
        ? [resolvedRecipient, parsedAmount]
        : undefined,
    chainId: connection.chain?.id || undefined,
    query: {
      enabled:
        !!resolvedTokenAddress &&
        !!resolvedRecipient &&
        parsedAmount !== undefined,
    },
  });

  // hook to send erc20 transaction
  const {
    data: sendErc20TransactionHash,
    isPending: isPendingSendErc20Transaction,
    writeContract: sendErc20Transaction,
    reset: resetSendErc20Transaction,
  } = useWriteContract();

  // hook to wait for transaction receipt
  const {
    isLoading: isConfirmingSendErc20Transaction,
    isSuccess: isConfirmedSendErc20Transaction,
  } = useWaitForTransactionReceipt({
    hash: sendErc20TransactionHash,
    chainId: selectedChain || undefined,
  });

  const selectedChainBlockExplorer = config.chains.find(
    (chain) => chain.id.toString() === selectedChain?.toString()
  )?.blockExplorers?.default.url;

  function handleReset() {
    resetSendErc20Transaction();
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

  useEffect(() => {
    resetSendErc20Transaction();
    form.reset();
    refetchTokenData();
  }, [selectedChain, resetSendErc20Transaction, form, refetchTokenData]);

  // Token list — fetched once, cached indefinitely, filtered to selected chain.
  // Excludes the native ETH sentinel address since ETH has its own send tab.
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const { data: tokenListData, isLoading: isLoadingTokenList } = useQuery({
    queryKey: ["token-list"],
    queryFn: async () => {
      const res = await fetch("/token-list.json");
      if (!res.ok) throw new Error("Failed to fetch token list");
      return res.json() as Promise<{ tokens: TokenListToken[] }>;
    },
    staleTime: Infinity,
  });
  const tokensForChain = (tokenListData?.tokens ?? []).filter(
    (t) => (selectedChain === null || t.chainId === selectedChain)
      && t.address.toLowerCase() !== ETH_ADDRESS.toLowerCase()
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-4">
        {/* token address field */}
        <div>
          <form.Field
            name="tokenAddress"
            validators={{
              onChange: ({ value }) => {
                if (!value) {
                  return "Please enter a token address";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-2 items-center">
                  <p className="text-muted-foreground">Token</p>
                </div>
                {/* grid: [dialog picker | address input] */}
                <div className="grid grid-cols-[auto_1fr] gap-2 items-start">
                  <TokenPickerDialog
                    tokens={tokensForChain}
                    value={field.state.value}
                    onSelect={(address) => field.handleChange(address)}
                    isLoading={isLoadingTokenList}
                  />
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
                        size="icon-xs"
                        onClick={() => refetchTokenEnsAddress()}
                        className="hover:cursor-pointer"
                      >
                        {isLoadingTokenEnsAddress ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <TokenAddressFieldInfo
                  field={field}
                  ensAddress={tokenEnsAddress}
                  isLoadingEnsAddress={isLoadingTokenEnsAddress}
                  isErrorEnsAddress={isErrorTokenEnsAddress}
                />
                {isBalanceQueryEnabled && isLoadingTokenData ? (
                  <Skeleton className="w-12 h-6" />
                ) : (
                  <div className="text-muted-foreground">
                    {tokenData?.[1]?.result ? tokenData[1].result : "-"}{" "}-{" "}
                    {tokenData?.[2]?.result ? tokenData[2].result : "-"}
                  </div>
                )}
              </div>
            )}
          </form.Field>
        </div>
        {/* amount field */}
        <div>
          <form.Field
            name="amount"
            validators={{
              onChange: ({ value }) => {
                if (!value) {
                  return "Please enter an amount to send";
                }

                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                  return "Please enter a valid number";
                }

                if (numValue <= 0) {
                  return "Amount must be greater than 0";
                }

                try {
                  const valueInUnits = parseUnits(
                    value,
                    tokenData?.[3]?.result || 18
                  );
                  if (
                    tokenData?.[0]?.result &&
                    valueInUnits > tokenData[0].result
                  ) {
                    return "Insufficient balance";
                  }
                } catch {
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
                          formatUnits(
                            (tokenData?.[0]?.result || BigInt(0)) / BigInt(4),
                            tokenData?.[3]?.result || 18
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
                          formatUnits(
                            (tokenData?.[0]?.result || BigInt(0)) / BigInt(2),
                            tokenData?.[3]?.result || 18
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
                          formatUnits(
                            ((tokenData?.[0]?.result || BigInt(0)) *
                              BigInt(3)) /
                              BigInt(4),
                            tokenData?.[3]?.result || 18
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
                          formatUnits(
                            tokenData?.[0]?.result || BigInt(0),
                            tokenData?.[3]?.result || 18
                          )
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
                      {isBalanceQueryEnabled && isLoadingTokenData ? (
                        <Skeleton className="w-10 h-4" />
                      ) : (
                        formatUnits(
                          tokenData?.[0]?.result || BigInt(0),
                          tokenData?.[3]?.result || 18
                        )
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {tokenData?.[2]?.result ? tokenData[2].result : "-"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none hover:cursor-pointer"
                    type="button"
                    onClick={() => refetchTokenData()}
                  >
                    {isBalanceQueryEnabled && isLoadingTokenData ? (
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
        {/* recipient field */}
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
        {/* action buttons + tx status */}
        <div className="flex flex-col gap-2">
          <form.Subscribe
            selector={(state) => [
              state.canSubmit,
              isPendingSendErc20Transaction,
              isConfirmingSendErc20Transaction,
            ]}
          >
            {([
              canSubmit,
              isPendingSendErc20Transaction,
              isConfirmingSendErc20Transaction,
            ]) => (
              <div className="grid grid-cols-5 gap-2">
                <Button
                  className="hover:cursor-pointer rounded-none col-span-1"
                  variant="outline"
                  size="icon"
                  type="reset"
                  disabled={
                    !canSubmit ||
                    isPendingSendErc20Transaction ||
                    isConfirmingSendErc20Transaction
                  }
                  onClick={handleReset}
                >
                  <Eraser className="w-4 h-4" />
                </Button>
                <Button
                  className="hover:cursor-pointer rounded-none col-span-2"
                  variant="outline"
                  type="button"
                  disabled={
                    !canSubmit ||
                    isPendingSendErc20Transaction ||
                    isConfirmingSendErc20Transaction
                  }
                  onClick={() => setShowTxObject((prev) => !prev)}
                >
                  Request
                </Button>
                <Button
                  className="hover:cursor-pointer rounded-none col-span-2"
                  type="submit"
                  disabled={
                    !canSubmit ||
                    isPendingSendErc20Transaction ||
                    isConfirmingSendErc20Transaction
                  }
                >
                  {isPendingSendErc20Transaction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isConfirmingSendErc20Transaction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isConfirmedSendErc20Transaction ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <>Send</>
                  )}
                </Button>
              </div>
            )}
          </form.Subscribe>
          {showTxObject && (
            <TransactionObject
              transactionObject={preparedTx?.request}
              isLoading={isLoadingPreparedTx}
              isError={isErrorPreparedTx}
            />
          )}
          <TransactionStatus
            isPending={isPendingSendErc20Transaction}
            isConfirming={isConfirmingSendErc20Transaction}
            isConfirmed={isConfirmedSendErc20Transaction}
            txHash={sendErc20TransactionHash}
            blockExplorerUrl={selectedChainBlockExplorer}
          />
        </div>
      </div>
    </form>
  );
}

function TokenAddressFieldInfo({
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
        <em>Please enter a token address or ENS</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${
            field.state.meta.errors.join(",") ===
            "Please enter a token address or ENS"
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

function AmountFieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {!field.state.meta.isTouched ? (
        <em>Please enter an amount to send</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${
            field.state.meta.errors.join(",") ===
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
          className={`${
            field.state.meta.errors.join(",") ===
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
