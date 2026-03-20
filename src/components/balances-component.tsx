import { useBalance } from "wagmi";
import { useConfig, useConnection } from "wagmi";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUnits } from "viem";

export default function BalancesComponent() {
  const config = useConfig();
  const connection = useConnection();

  // check if balance query should be enabled
  const isBalanceQueryEnabled = !!connection.address && !!connection.chain;

  const {
    data: balance,
    isLoading: isLoadingBalance,
    isError: isErrorBalance,
    refetch: refetchBalance,
  } = useBalance({
    query: {
      enabled: isBalanceQueryEnabled,
      refetchOnMount: false,
    },
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
  });

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8 h-fit">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-md font-bold">Balances</h1>
      </div>
      {isBalanceQueryEnabled && isErrorBalance && (
        <div className="flex flex-col gap-4 px-4 py-2">
          <div className="bg-destructive text-destructive-foreground p-2 rounded-none">
            Error loading balance
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4 px-4 py-2">
        <div className="flex flex-row justify-between items-center gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex flex-row gap-2">
              <h3>
                {
                  connection.chain ? config.chains.find((chain) => chain.id === connection.chain?.id)
                    ?.nativeCurrency.name : "Name"
                }
              </h3>
              <h3 className="text-muted-foreground">
                {
                  connection.chain ? config.chains.find((chain) => chain.id === connection.chain?.id)
                    ?.nativeCurrency.symbol : "Symbol"
                }
              </h3>
            </div>
            <div className="flex flex-row gap-2 items-center">
              <div className="text-muted-foreground">&gt;</div>
              {isBalanceQueryEnabled && isLoadingBalance ? (
                <Skeleton className="w-10 h-4" />
              ) : (
                <div>{formatUnits(balance?.value ?? BigInt(0), 18)}</div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p>$ --</p>
            <p>-- %</p>
          </div>
        </div>
      </div>
    </div>
  );
}
