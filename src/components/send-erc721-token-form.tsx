import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Check, Search, Eraser } from "lucide-react";
import { type Address } from "viem";
import {
  useConfig,
  useWaitForTransactionReceipt,
  useEnsAddress,
  useReadContracts,
  useWriteContract,
  useConnection,
  useSimulateContract,
} from "wagmi";
import { normalize } from "viem/ens";
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

const erc721Abi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export default function SendErc721TokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  // get Wagmi config
  const config = useConfig();

  // get connection
  const connection = useConnection();

  // show/hide prepared transaction object
  const [showTxObject, setShowTxObject] = useState(false);

  // send form
  const form = useForm({
    defaultValues: {
      tokenAddress: "",
      tokenId: "",
      receivingAddress: "",
      type: "erc721",
    },
    onSubmit: async ({ value }) => {
      if (value.type === "erc721") {
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

        // execute the send erc721 transaction
        sendErc721Transaction({
          address: resolvedTokenAddress as Address,
          abi: erc721Abi,
          functionName: "safeTransferFrom",
          args: [connection.address as Address, recipientAddress, BigInt(value.tokenId)],
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

  // get token ID reactively from form store
  const tokenId = useStore(
    form.store,
    (state) => state.values.tokenId || ""
  );

  // get receiving address reactively from form store
  const receivingAddress = useStore(
    form.store,
    (state) => state.values.receivingAddress || ""
  );

  // get ENS address for token contract
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

  // safely parse token ID to avoid throwing on invalid input
  let parsedTokenId: bigint | undefined;
  try {
    parsedTokenId = tokenId ? BigInt(tokenId) : undefined;
  } catch {
    parsedTokenId = undefined;
  }

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
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [connection.address as Address],
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc721Abi,
        functionName: "name",
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc721Abi,
        functionName: "symbol",
        chainId: connection.chain?.id || undefined,
      },
      {
        address: resolvedTokenAddress,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [parsedTokenId ?? BigInt(0)],
        chainId: connection.chain?.id || undefined,
      },
    ],
    query: {
      enabled: isBalanceQueryEnabled && !!resolvedTokenAddress,
    },
  });

  const ownerOfToken = tokenData?.[3]?.result as Address | undefined;
  const isOwnedByUser =
    ownerOfToken &&
    connection.address &&
    ownerOfToken.toLowerCase() === connection.address.toLowerCase();

  // prepare transaction request
  const {
    data: preparedTx,
    isLoading: isLoadingPreparedTx,
    isError: isErrorPreparedTx,
  } = useSimulateContract({
    address: resolvedTokenAddress,
    abi: erc721Abi,
    functionName: "safeTransferFrom",
    args:
      connection.address && resolvedRecipient && parsedTokenId !== undefined
        ? [connection.address, resolvedRecipient, parsedTokenId]
        : undefined,
    chainId: connection.chain?.id || undefined,
    query: {
      enabled:
        !!resolvedTokenAddress &&
        !!connection.address &&
        !!resolvedRecipient &&
        parsedTokenId !== undefined,
    },
  });

  // hook to send erc721 transaction
  const {
    data: sendErc721TransactionHash,
    isPending: isPendingSendErc721Transaction,
    writeContract: sendErc721Transaction,
    reset: resetSendErc721Transaction,
  } = useWriteContract();

  // hook to wait for transaction receipt
  const {
    isLoading: isConfirmingSendErc721Transaction,
    isSuccess: isConfirmedSendErc721Transaction,
  } = useWaitForTransactionReceipt({
    hash: sendErc721TransactionHash,
    chainId: selectedChain || undefined,
  });

  const selectedChainBlockExplorer = config.chains.find(
    (chain) => chain.id.toString() === selectedChain?.toString()
  )?.blockExplorers?.default.url;

  function handleReset() {
    resetSendErc721Transaction();
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
    resetSendErc721Transaction();
    form.reset();
    refetchTokenData();
  }, [selectedChain, resetSendErc721Transaction, form, refetchTokenData]);

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
                  return "Please enter a contract address";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-2 items-center">
                  <p className="text-muted-foreground">Contract</p>
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
        {/* token ID field */}
        <div>
          <form.Field
            name="tokenId"
            validators={{
              onChange: ({ value }) => {
                if (!value) {
                  return "Please enter a token ID";
                }
                try {
                  BigInt(value);
                } catch {
                  return "Please enter a valid token ID";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-0">
                <div className="flex flex-row gap-2 items-center justify-between">
                  <p className="text-muted-foreground">Token ID</p>
                </div>
                <div className="flex flex-row items-center justify-between my-2">
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value || ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="bg-transparent text-2xl outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    required
                  />
                </div>
                <div className="flex flex-row items-center justify-between">
                  <div className="flex flex-row gap-2">
                    <div className="text-muted-foreground">
                      {isBalanceQueryEnabled && isLoadingTokenData ? (
                        <Skeleton className="w-10 h-4" />
                      ) : (
                        `${tokenData?.[0]?.result?.toString() ?? "0"} owned`
                      )}
                    </div>
                    {parsedTokenId !== undefined && (
                      <p
                        className={
                          isLoadingTokenData
                            ? "text-muted-foreground"
                            : isOwnedByUser
                              ? "text-green-500"
                              : "text-red-400"
                        }
                      >
                        {isLoadingTokenData
                          ? "..."
                          : isOwnedByUser
                            ? "✓ yours"
                            : "✗ not yours"}
                      </p>
                    )}
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
                <TokenIdFieldInfo field={field} />
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
              isPendingSendErc721Transaction,
              isConfirmingSendErc721Transaction,
            ]}
          >
            {([
              canSubmit,
              isPendingSendErc721Transaction,
              isConfirmingSendErc721Transaction,
            ]) => (
              <div className="grid grid-cols-5 gap-2">
                <Button
                  className="hover:cursor-pointer rounded-none col-span-1"
                  variant="outline"
                  size="icon"
                  type="reset"
                  disabled={
                    !canSubmit ||
                    isPendingSendErc721Transaction ||
                    isConfirmingSendErc721Transaction
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
                    isPendingSendErc721Transaction ||
                    isConfirmingSendErc721Transaction
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
                    isPendingSendErc721Transaction ||
                    isConfirmingSendErc721Transaction
                  }
                >
                  {isPendingSendErc721Transaction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isConfirmingSendErc721Transaction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isConfirmedSendErc721Transaction ? (
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
            isPending={isPendingSendErc721Transaction}
            isConfirming={isConfirmingSendErc721Transaction}
            isConfirmed={isConfirmedSendErc721Transaction}
            txHash={sendErc721TransactionHash}
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
        <em>Please enter a contract address or ENS</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${
            field.state.meta.errors.join(",") ===
            "Please enter a contract address or ENS"
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

function TokenIdFieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {!field.state.meta.isTouched ? (
        <em>Please enter a token ID</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={`${
            field.state.meta.errors.join(",") === "Please enter a token ID"
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
