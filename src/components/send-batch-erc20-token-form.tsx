import { useEffect, useState } from "react";
import { isAddress, erc20Abi, type Address } from "viem";
import {
  useBalance,
  useConnection,
  useCapabilities,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BatchSimpleEditor } from "@/components/send-batch-simple-editor";
import { BatchTextEditor } from "@/components/send-batch-text-editor";
import { BatchFileUpload } from "@/components/send-batch-file-upload";
import { TokenPickerDialog, type TokenListToken } from "@/components/token-picker-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";
import type { BatchTokenProps } from "@/lib/send-batch-utils";

// ── SendBatchErc20TokenForm ───────────────────────────────────────────────────

export default function SendBatchErc20TokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  const connection = useConnection();
  const isConnected = !!connection.chain && !!connection.address;

  const { data: capabilities, isLoading: isLoadingCapabilities } = useCapabilities({ query: { enabled: isConnected } });
  const atomicBatch = connection.chain?.id ? capabilities?.[connection.chain.id]?.atomicBatch : undefined;

  const {
    data: nativeBalanceData,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useBalance({
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
    query: { enabled: isConnected },
  });

  useEffect(() => { refetchNativeBalance(); }, [selectedChain, refetchNativeBalance]);

  // ── Token list ───────────────────────────────────────────────────────────────
  // Fetched once from /token-list.json and cached indefinitely (staleTime:
  // Infinity) — the list rarely changes and is only filtered client-side.
  // Filtered to the currently selected chain so only relevant tokens appear.
  const { data: tokenListData, isLoading: isLoadingTokenList } = useQuery({
    queryKey: ["token-list"],
    queryFn: async () => {
      const res = await fetch("/token-list.json");
      if (!res.ok) throw new Error("Failed to fetch token list");
      return res.json() as Promise<{ tokens: TokenListToken[] }>;
    },
    staleTime: Infinity,
  });

  // Exclude the native ETH sentinel address — ETH has its own dedicated tab.
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const tokensForChain = (tokenListData?.tokens ?? []).filter(
    (t) => (selectedChain === null || t.chainId === selectedChain)
      && t.address.toLowerCase() !== ETH_ADDRESS.toLowerCase()
  );

  // ── Token address state ──────────────────────────────────────────────────────
  // A single string drives both inputs: the dialog sets it to the chosen
  // token's address, and the manual input field lets the user type/paste
  // any address directly. Both paths converge on the same tokenAddress derived
  // value below.
  const [tokenInput, setTokenInput] = useState("");
  const tokenAddress = isAddress(tokenInput) ? (tokenInput as Address) : null;

  // When a token is picked from the dialog, populate the address input so the
  // user can see and copy the address, and so the onchain reads fire.
  function handleDialogSelect(address: string) {
    setTokenInput(address);
  }

  // ── Onchain token metadata ───────────────────────────────────────────────────
  // Batch-read name, symbol, and decimals in a single multicall.
  const { data: tokenData, isLoading: isLoadingToken } = useReadContracts({
    contracts: tokenAddress ? [
      { address: tokenAddress, abi: erc20Abi, functionName: "name" as const },
      { address: tokenAddress, abi: erc20Abi, functionName: "symbol" as const },
      { address: tokenAddress, abi: erc20Abi, functionName: "decimals" as const },
    ] : [],
    query: { enabled: !!tokenAddress },
  });

  const { data: tokenBalance, isLoading: isLoadingBalance } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connection.address!],
    query: { enabled: !!tokenAddress && !!connection.address },
  });

  const tokenName    = tokenData?.[0]?.status === "success" ? (tokenData[0].result as string) : undefined;
  const tokenSymbol  = tokenData?.[1]?.status === "success" ? (tokenData[1].result as string) : undefined;
  const tokenDecimals = tokenData?.[2]?.status === "success" ? (tokenData[2].result as number) : undefined;
  const isTokenLoaded = !!tokenName && tokenDecimals !== undefined && !!tokenSymbol;

  const token: BatchTokenProps | undefined = isTokenLoaded && tokenAddress ? {
    address: tokenAddress,
    symbol: tokenSymbol!,
    decimals: tokenDecimals!,
    balance: tokenBalance,
    isLoading: isLoadingToken || isLoadingBalance,
  } : undefined;

  const editorProps = {
    nativeBalance: nativeBalanceData,
    isLoadingNativeBalance,
    atomicBatchSupported: !!atomicBatch?.supported,
    selectedChain,
    token,
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h2 className="text-md font-bold">Token</h2>

      {/* ── Token selector ────────────────────────────────────────────────────
          Grid: [dialog button | address input]
          Left — TokenPickerDialog lets the user browse/search the token list
                 filtered to the current chain. Selecting a token populates the
                 address input on the right.
          Right — Manual address input with a search icon button for users who
                  want to paste an arbitrary contract address not in the list. */}
      <div className="grid grid-cols-[auto_1fr] gap-2 items-start">
        {/* Token list dialog */}
        <TokenPickerDialog
          tokens={tokensForChain}
          value={tokenInput}
          onSelect={handleDialogSelect}
          isLoading={isLoadingTokenList}
        />

        {/* Manual address input */}
        <div className="flex flex-col gap-1">
          <InputGroup>
            <InputGroupInput
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ERC20 token address (0x...)"
              className="rounded-none h-8 text-xs font-mono"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                aria-label="Paste address"
                size="icon-xs"
                className="hover:cursor-pointer"
                onClick={async () => {
                  const text = await navigator.clipboard.readText();
                  if (text) setTokenInput(text.trim());
                }}
              >
                <Search className="w-3 h-3" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          {/* Inline validation / resolution feedback */}
          {tokenInput && !tokenAddress && (
            <span className="text-xs text-red-400">Invalid address</span>
          )}
          {tokenAddress && isLoadingToken && (
            <Skeleton className="w-32 h-4" />
          )}
          {tokenAddress && !isLoadingToken && tokenName && (
            <span className="text-xs text-green-500">{tokenName} ({tokenSymbol})</span>
          )}
          {tokenAddress && !isLoadingToken && !tokenName && (
            <span className="text-xs text-red-400">Token not found</span>
          )}
        </div>
      </div>

      {/* capabilities badge */}
      {isLoadingCapabilities ? (
        <Skeleton className="w-24 h-5" />
      ) : (
        <Badge variant="outline">
          <span className={`size-2 rounded-full ${atomicBatch?.supported ? "bg-green-500" : "bg-red-400"}`} />
          Atomic batch
        </Badge>
      )}

      {/* editors — always shown */}
      <Tabs defaultValue="simple-editor" className="w-full">
        <TabsList className="border-primary border rounded-none">
          <TabsTrigger className="rounded-none" value="simple-editor">Simple</TabsTrigger>
          <TabsTrigger className="rounded-none" value="text-editor">Text</TabsTrigger>
          <TabsTrigger className="rounded-none" value="file-upload">File</TabsTrigger>
        </TabsList>
        <TabsContent value="simple-editor">
          <BatchSimpleEditor {...editorProps} />
        </TabsContent>
        <TabsContent value="text-editor">
          <BatchTextEditor {...editorProps} />
        </TabsContent>
        <TabsContent value="file-upload">
          <BatchFileUpload {...editorProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
