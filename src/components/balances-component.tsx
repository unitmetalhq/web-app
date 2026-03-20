import { useBalance, useConfig, useConnection, useReadContracts } from "wagmi";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUnits, erc20Abi } from "viem";
import type { Address } from "viem";
import { TOKENS } from "@/lib/um-token-list";
// import type { Token } from "@/types/token";
import { RefreshCw } from "lucide-react";


export default function BalancesComponent() {
  const config = useConfig();
  const connection = useConnection();

  const isQueryEnabled = !!connection.address && !!connection.chain;
  const chainId = connection.chain?.id;
  const nativeCurrency = chainId
    ? config.chains.find((c) => c.id === chainId)?.nativeCurrency
    : undefined;
  const tokens = chainId ? (TOKENS[chainId] ?? []) : [];

  // Single multicall for all token balances
  const { data: tokenBalances, isLoading: isLoadingTokens, isError: isErrorTokens, refetch: refetchTokens } = useReadContracts({
    contracts: tokens.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [connection.address!] as [Address],
      chainId,
    })),
    query: { enabled: isQueryEnabled && tokens.length > 0, refetchOnMount: false },
  });

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8 h-fit">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-md font-bold">Balances</h1>
      </div>

      {/* Native balance */}
      <div className="flex flex-col gap-4 px-4 py-2">
        <NativeBalanceRow
          address={connection.address}
          chainId={chainId}
          name={nativeCurrency?.name ?? "Native"}
          symbol={nativeCurrency?.symbol ?? "—"}
          decimals={nativeCurrency?.decimals ?? 18}
          isQueryEnabled={isQueryEnabled}
        />
      </div>

      {/* Token balances */}
      {tokens.length > 0 && (
        <>
          <div className="px-4">
            <div className="border-t border-border" />
          </div>
          <div className="flex flex-col gap-4 px-4 py-2">
            {tokens.map((token, i) => {
              const raw = tokenBalances?.[i];
              const rawBalance = raw?.status === "success" ? (raw.result as bigint) : undefined;
              if (!isLoadingTokens && !isErrorTokens && !rawBalance) return null;
              return (
                <BalanceRow
                  key={token.address}
                  name={token.name}
                  symbol={token.symbol}
                  value={formatUnits(rawBalance ?? BigInt(0), token.decimals)}
                  isLoading={isQueryEnabled && isLoadingTokens}
                  isError={raw?.status === "failure"}
                  onRefresh={refetchTokens}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── NativeBalanceRow ──────────────────────────────────────────────────────────

function NativeBalanceRow({
  address,
  chainId,
  name,
  symbol,
  decimals,
  isQueryEnabled,
}: {
  address: Address | undefined;
  chainId: number | undefined;
  name: string;
  symbol: string;
  decimals: number;
  isQueryEnabled: boolean;
}) {
  const { data: balance, isLoading, isError, refetch } = useBalance({
    address: address || undefined,
    chainId: chainId || undefined,
    query: { enabled: isQueryEnabled, refetchOnMount: false },
  });

  return (
    <BalanceRow
      name={name}
      symbol={symbol}
      value={formatUnits(balance?.value ?? BigInt(0), decimals)}
      isLoading={isQueryEnabled && isLoading}
      isError={isQueryEnabled && isError}
      onRefresh={refetch}
    />
  );
}

// ── BalanceRow ────────────────────────────────────────────────────────────────

function BalanceRow({
  name,
  symbol,
  value,
  isLoading,
  isError,
  onRefresh,
}: {
  name: string;
  symbol: string;
  value: string;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-row justify-between items-center gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex flex-row gap-2">
          <h3>{name}</h3>
          <h3 className="text-muted-foreground">{symbol}</h3>
        </div>
        <p>-- %</p>
      </div>
      <div className="flex flex-col gap-1 text-right">
        <p>$ --</p>
        <div className="flex flex-row gap-2 items-center justify-end">
          {isLoading ? (
            <Skeleton className="w-10 h-4" />
          ) : isError ? (
            <span className="text-xs text-destructive">error</span>
          ) : (
            <div>{value}</div>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="text-muted-foreground hover:text-foreground hover:cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
