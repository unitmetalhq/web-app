import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useConfig,
  useConnection,
} from "wagmi";
import SendNativeTokenForm from "@/components/send-native-token-form";
import SendErc20TokenForm from "@/components/send-erc20-token-form";
import SendErc721TokenForm from "@/components/send-erc721-token-form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import SendBatchNativeTokenForm from "./send-batch-native-token-form";


export default function SendComponent() {
  // get Wagmi config
  const config = useConfig();

  // get connection
  const connection = useConnection();

  // selected asset type (empty string = no selection)
  const [selectedSingleAsset, setSelectedSingleAsset] = useState("");

  // selected asset type for batch (empty string = no selection)
  const [selectedBatchAsset, setSelectedBatchAsset] = useState("");

  // function to handle select different asset type
  function handleSelectedSingleAssetChange(value: string | null) {
    setSelectedSingleAsset(value ?? "");
  }

  // function to handle select different asset type
  function handleSelectedBatchAssetChange(value: string | null) {
    setSelectedBatchAsset(value ?? "");
  }

  // get native currency symbol for connected chain
  const nativeSymbol = connection.chain
    ? (config.chains.find((c) => c.id === connection.chain!.id)?.nativeCurrency.symbol ?? "Native")
    : "Native";

  // define forms
  const forms = [
    { label: "Select an asset type", value: "" },
    { label: nativeSymbol, value: "native" },
    { label: "Token", value: "token" },
    { label: "NFT", value: "nft" },
  ]

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-md font-bold">Send</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 py-2">
        <Tabs defaultValue="native" className="w-full">
          <TabsList className="border-primary border rounded-none">
            <TabsTrigger className="rounded-none" value="single">
              Single
            </TabsTrigger>
            <TabsTrigger className="rounded-none" value="batch">
              Batch
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
            <div className="flex flex-col gap-1 mt-2">
              <Select value={selectedSingleAsset} onValueChange={handleSelectedSingleAssetChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select asset type">
                    {(value: string | null) => forms.find((f) => f.value === value)?.label ?? "Select asset type"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {forms.map((form) => (
                      <SelectItem key={form.value} value={form.value}>
                        {form.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedSingleAsset === "native" && (
                <SendNativeTokenForm selectedChain={connection.chain?.id || null} />
              )}
              {selectedSingleAsset === "token" && (
                <SendErc20TokenForm selectedChain={connection.chain?.id || null} />
              )}
              {selectedSingleAsset === "nft" && (
                <SendErc721TokenForm selectedChain={connection.chain?.id || null} />
              )}
            </div>
          </TabsContent>
          <TabsContent value="batch" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 mt-2">
              <Select value={selectedBatchAsset} onValueChange={handleSelectedBatchAssetChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select asset type">
                    {(value: string | null) => forms.find((f) => f.value === value)?.label ?? "Select asset type"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {forms.map((form) => (
                      <SelectItem key={form.value} value={form.value}>
                        {form.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedBatchAsset === "native" && (
                <SendBatchNativeTokenForm selectedChain={connection.chain?.id || null} /> 
              )}
              {selectedBatchAsset === "token" && (
                <div>WIP</div>
              )}
              {selectedBatchAsset === "nft" && (
                <div>WIP</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}