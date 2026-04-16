import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NftPickerDialog } from "@/components/nft-picker-dialog";
import { erc721Abi, isAddress, type Address } from "viem";
import {
  useBalance,
  useConnection,
  useCapabilities,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BatchSimpleEditor } from "@/components/send-batch-simple-editor";
import { BatchTextEditor } from "@/components/send-batch-text-editor";
import { BatchFileUpload } from "@/components/send-batch-file-upload";
import type { BatchEditorProps, BatchTokenProps } from "@/lib/send-batch-utils";

// ── SendBatchErc721TokenForm ──────────────────────────────────────────────────

export default function SendBatchErc721TokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  const connection = useConnection();
  const isConnected = !!connection.chain && !!connection.address;

  const { data: capabilities, isLoading: isLoadingCapabilities } = useCapabilities({ query: { enabled: isConnected } });
  const atomicBatch = connection.chain?.id ? capabilities?.[connection.chain.id]?.atomicBatch : undefined;

  const { data: nativeBalanceData, isLoading: isLoadingNativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
    query: { enabled: isConnected },
  });

  useEffect(() => { refetchNativeBalance(); }, [selectedChain, refetchNativeBalance]);

  const [tokenInput, setTokenInput] = useState("");
  const tokenAddress = isAddress(tokenInput) ? (tokenInput as Address) : null;

  const { data: contractData, isLoading: isLoadingContract } = useReadContracts({
    contracts: tokenAddress ? [
      { address: tokenAddress, abi: erc721Abi, functionName: "name" as const },
      { address: tokenAddress, abi: erc721Abi, functionName: "symbol" as const },
    ] : [],
    query: { enabled: !!tokenAddress },
  });

  const contractName = contractData?.[0]?.status === "success" ? (contractData[0].result as string) : undefined;
  const contractSymbol = contractData?.[1]?.status === "success" ? (contractData[1].result as string) : undefined;
  const isContractLoaded = !!contractName && !!contractSymbol;

  const {
    data: approvedForAll,
    isLoading: isLoadingApproval,
    refetch: refetchApproval,
  } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc721Abi,
    functionName: "isApprovedForAll",
    args: [connection.address!, BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address],
    query: { enabled: !!tokenAddress && !!connection.address },
  });

  const isApprovedForAll = approvedForAll === true;

  const token: BatchTokenProps | undefined = isContractLoaded && tokenAddress && contractSymbol ? {
    address: tokenAddress,
    symbol: contractSymbol,
    decimals: 0,
    balance: undefined,
    isLoading: isLoadingContract,
    isNft: true,
  } : undefined;

  const editorProps: BatchEditorProps = {
    nativeBalance: nativeBalanceData,
    isLoadingNativeBalance,
    atomicBatchSupported: !!atomicBatch?.supported,
    selectedChain,
    token,
    isApprovedForAll,
    onApproveSuccess: () => void refetchApproval(),
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h2 className="text-md font-bold">NFT Contract</h2>

      {/* contract address input */}
      <div className="flex flex-col gap-1">
        {/* grid: [picker button | address input] */}
        <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
          <NftPickerDialog
            contractValue={tokenInput}
            tokenIdValue=""
            onSelect={(addr) => setTokenInput(addr)}
            chainId={selectedChain ?? undefined}
          />
          <Input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ERC721 contract address (0x...)"
            className="rounded-none h-8 text-xs font-mono"
          />
        </div>
        {tokenInput && !tokenAddress && <span className="text-xs text-red-400">Invalid address</span>}
        {tokenAddress && isLoadingContract && <Skeleton className="w-32 h-4" />}
        {tokenAddress && !isLoadingContract && contractName && (
          <span className="text-xs text-green-500">{contractName} ({contractSymbol})</span>
        )}
        {tokenAddress && !isLoadingContract && !contractName && (
          <span className="text-xs text-red-400">Contract not found</span>
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

      {/* approval status — display only, approve flow is inside editors */}
      {isContractLoaded && tokenAddress && (
        <div className="flex flex-row items-center justify-between border p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">Contract approval</span>
            <span className="text-xs text-muted-foreground">
              Allow BatchDistributor to transfer your {contractSymbol} tokens
            </span>
          </div>
          {isLoadingApproval ? (
            <Skeleton className="w-16 h-6" />
          ) : isApprovedForAll ? (
            <Badge variant="outline" className="text-green-500 border-green-500">Approved</Badge>
          ) : (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">Not approved</Badge>
          )}
        </div>
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
