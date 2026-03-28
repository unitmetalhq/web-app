import { useEffect } from "react";
import { useBalance, useConnection, useCapabilities } from "wagmi";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BatchSimpleEditor } from "@/components/send-batch-simple-editor";
import { BatchTextEditor } from "@/components/send-batch-text-editor";
import { BatchFileUpload } from "@/components/send-batch-file-upload";

export default function SendBatchNativeTokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  const connection = useConnection();

  const isBalanceQueryEnabled = !!connection.chain && !!connection.address;

  const {
    data: capabilities,
    isLoading: isLoadingCapabilities,
  } = useCapabilities({
    query: { enabled: isBalanceQueryEnabled },
  });

  const atomicBatch = connection.chain?.id
    ? capabilities?.[connection.chain.id]?.atomicBatch
    : undefined;

  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useBalance({
    query: { enabled: isBalanceQueryEnabled },
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
  });

  useEffect(() => {
    refetchNativeBalance();
  }, [selectedChain, refetchNativeBalance]);

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h2 className="text-md font-bold">Input mode</h2>
      {isLoadingCapabilities ? (
        <Skeleton className="w-24 h-5" />
      ) : (
        <Badge variant="outline">
          <span className={`size-2 rounded-full ${atomicBatch?.supported ? "bg-green-500" : "bg-red-400"}`} />
          Atomic batch
        </Badge>
      )}
      <Tabs defaultValue="simple-editor" className="w-full">
        <TabsList className="border-primary border rounded-none">
          <TabsTrigger className="rounded-none" value="simple-editor">
            Simple
          </TabsTrigger>
          <TabsTrigger className="rounded-none" value="text-editor">
            Text
          </TabsTrigger>
          <TabsTrigger className="rounded-none" value="file-upload">
            File
          </TabsTrigger>
        </TabsList>
        <TabsContent value="simple-editor">
          <BatchSimpleEditor
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
        <TabsContent value="text-editor">
          <BatchTextEditor
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
        <TabsContent value="file-upload">
          <BatchFileUpload
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
