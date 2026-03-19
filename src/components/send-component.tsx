import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useConfig,
  useConnection,
} from "wagmi";
import SendNativeTokenForm from "@/components/send-native-token-form";
import SendErc20TokenForm from "@/components/send-erc20-token-form";


export default function SendComponent() {
  // get Wagmi config
  const config = useConfig();

  // get connection
  const connection = useConnection();

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-lg font-bold">Send</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 py-2">
        <Tabs defaultValue="native" className="w-full">
          <TabsList className="border-primary border rounded-none">
            <TabsTrigger className="rounded-none" value="native">
              {connection.chain
                ? config.chains.find(
                    (c) => c.id.toString() === connection.chain?.id?.toString()
                  )?.nativeCurrency.symbol || "Native"
                : "Native"}
            </TabsTrigger>
            <TabsTrigger className="rounded-none" value="erc20">
              ERC20
            </TabsTrigger>
          </TabsList>
          <TabsContent value="native">
            <SendNativeTokenForm selectedChain={connection.chain?.id || null} />
          </TabsContent>
          <TabsContent value="erc20" className="flex flex-col gap-4">
            <SendErc20TokenForm selectedChain={connection.chain?.id || null} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}