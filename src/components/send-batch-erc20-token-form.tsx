import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { isAddress, erc20Abi, type Address } from "viem";
import {
  useBalance,
  useConnection,
  useCapabilities,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BatchSimpleEditor } from "@/components/send-batch-simple-editor";
import { BatchTextEditor } from "@/components/send-batch-text-editor";
import { BatchFileUpload } from "@/components/send-batch-file-upload";
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

  const [tokenInput, setTokenInput] = useState("");
  const tokenAddress = isAddress(tokenInput) ? (tokenInput as Address) : null;

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

  const tokenName = tokenData?.[0]?.status === "success" ? (tokenData[0].result as string) : undefined;
  const tokenSymbol = tokenData?.[1]?.status === "success" ? (tokenData[1].result as string) : undefined;
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

      {/* token address input */}
      <div className="flex flex-col gap-1">
        <Input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="ERC20 token address (0x...)"
          className="rounded-none h-8 text-xs font-mono"
        />
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
