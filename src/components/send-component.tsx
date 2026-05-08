import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useConfig,
  useConnection,
} from "wagmi";
import SendNativeTokenForm from "@/components/send-native-token-form";
import SendErc20TokenForm from "@/components/send-erc20-token-form";
import SendErc721TokenForm from "@/components/send-erc721-token-form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import SendBatchNativeTokenForm from "./send-batch-native-token-form";
import SendBatchErc20TokenForm from "./send-batch-erc20-token-form";
import SendBatchErc721TokenForm from "./send-batch-erc721-token-form";


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
    { label: nativeSymbol, value: "native" },
    { label: "Token", value: "token" },
    { label: "NFT", value: "nft" },
  ]

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8 h-fit">
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
              <RadioGroup
                value={selectedSingleAsset}
                onValueChange={handleSelectedSingleAssetChange}
                className="grid grid-cols-3 gap-2"
              >
                {forms.map((form) => (
                  <FieldLabel key={form.value} htmlFor={`single-${form.value}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{form.label}</FieldTitle>
                      </FieldContent>
                      <RadioGroupItem value={form.value} id={`single-${form.value}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
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
              <RadioGroup
                value={selectedBatchAsset}
                onValueChange={handleSelectedBatchAssetChange}
                className="grid grid-cols-3 gap-2"
              >
                {forms.map((form) => (
                  <FieldLabel key={form.value} htmlFor={`batch-${form.value}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{form.label}</FieldTitle>
                      </FieldContent>
                      <RadioGroupItem value={form.value} id={`batch-${form.value}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {selectedBatchAsset === "native" && (
                <SendBatchNativeTokenForm selectedChain={connection.chain?.id || null} /> 
              )}
              {selectedBatchAsset === "token" && (
                <SendBatchErc20TokenForm selectedChain={connection.chain?.id || null} />
              )}
              {selectedBatchAsset === "nft" && (
                <SendBatchErc721TokenForm selectedChain={connection.chain?.id || null} />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}