import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import {
  Loader2,
  Check,
  ExternalLink,
  ArrowUpDown,
  Eraser,
  RefreshCcw,
  ChevronDown,
  Quote
} from "lucide-react";
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem";
import {
  useConfig,
  useWaitForTransactionReceipt,
  useReadContracts,
  useReadContract,
  useBalance,
  useWriteContract,
  useConnection,
  useCapabilities,
} from "wagmi";

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;
import { useMediaQuery } from "@/hooks/use-media-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Kbd } from "@/components/ui/kbd";


type TokenListToken = {
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
};

export default function SwapComponent({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-8">
      <div className="flex flex-row justify-between items-center bg-primary text-secondary pl-1">
        <h1 className="text-md font-bold">Swap</h1>
      </div>
      <div className="flex flex-col gap-4 px-4 py-2">
        <SwapForm selectedChain={selectedChain} />
      </div>
    </div>
  );
}

function SwapForm({ selectedChain }: { selectedChain: number | null }) {
  const config = useConfig();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const connection = useConnection();

  const search = useSearch({ from: '/swap' });
  const navigate = useNavigate({ from: '/swap' });

  const { data: tokenList, isLoading: isLoadingTokens } = useQuery({
    queryKey: ["token-list"],
    queryFn: async () => {
      const res = await fetch("/token-list.json");
      if (!res.ok) throw new Error("Failed to fetch token list");
      return res.json() as Promise<{ tokens: TokenListToken[] }>;
    },
    staleTime: Infinity,
  });

  const effectiveChain = selectedChain ?? search.chain ?? connection.chain?.id ?? null;
  const tokens = effectiveChain
    ? (tokenList?.tokens.filter((t) => t.chainId === effectiveChain) ?? [])
    : [];

  const form = useForm({
    defaultValues: {
      tokenIn: search.from,
      tokenOut: search.to,
      amountIn: "",
      amountOut: "",
      route: BEST_ROUTE,
    },
    onSubmit: async ({ value }) => {
      // TODO: integrate DEX aggregator (e.g. 0x, Uniswap Universal Router)
      console.log("swap", value);
    },
  });

  const tokenIn = useStore(form.store, (state) => state.values.tokenIn);
  const tokenOut = useStore(form.store, (state) => state.values.tokenOut);

  // const tokenInMeta = tokens.find((t) => t.address === tokenIn);
  // const tokenOutMeta = tokens.find((t) => t.address === tokenOut);
  // const tokenInDecimals = tokenInMeta?.decimals ?? 18;
  // const tokenOutDecimals = tokenOutMeta?.decimals ?? 18;

  const isBalanceQueryEnabled = !!connection.chain && !!connection.address;

  const { data: capabilities } = useCapabilities();
  const supportsAtomicBatch =
    capabilities?.[connection.chain?.id ?? 0]?.atomicBatch?.supported ?? false;

  // const {
  //   data: tokenInBalanceData,
  //   isLoading: isLoadingTokenInBalance,
  //   refetch: refetchTokenInBalance,
  // } = useReadContracts({
  //   contracts: [
  //     {
  //       address: tokenIn as Address,
  //       abi: erc20Abi,
  //       functionName: "balanceOf",
  //       args: [connection.address as Address],
  //       chainId: connection.chain?.id,
  //     },
  //   ],
  //   query: { enabled: isBalanceQueryEnabled && !!tokenIn },
  // });

  // const {
  //   data: tokenOutBalanceData,
  //   isLoading: isLoadingTokenOutBalance,
  // } = useReadContracts({
  //   contracts: [
  //     {
  //       address: tokenOut as Address,
  //       abi: erc20Abi,
  //       functionName: "balanceOf",
  //       args: [connection.address as Address],
  //       chainId: connection.chain?.id,
  //     },
  //   ],
  //   query: { enabled: isBalanceQueryEnabled && !!tokenOut },
  // });

  // const tokenInBalance = tokenInBalanceData?.[0]?.result as bigint | undefined;
  // const tokenOutBalance = tokenOutBalanceData?.[0]?.result as bigint | undefined;

  // let parsedAmountIn: bigint | undefined;
  // try {
  //   parsedAmountIn = amountIn ? parseUnits(amountIn, tokenInDecimals) : undefined;
  // } catch {
  //   parsedAmountIn = undefined;
  // }

  // const {
  //   data: swapTxHash,
  //   isPending: isPendingSwap,
  //   reset: resetSwap,
  // } = useWriteContract();

  // const {
  //   isLoading: isConfirmingSwap,
  //   isSuccess: isConfirmedSwap,
  // } = useWaitForTransactionReceipt({
  //   hash: swapTxHash,
  //   chainId: selectedChain || undefined,
  // });

  // const selectedChainBlockExplorer = config.chains.find(
  //   (chain) => chain.id.toString() === selectedChain?.toString()
  // )?.blockExplorers?.default.url;

  // function handleReset() {
  //   resetSwap();
  //   form.reset();
  // }

  // function handleFlip() {
  //   const inVal = form.getFieldValue("tokenIn");
  //   const outVal = form.getFieldValue("tokenOut");
  //   form.setFieldValue("tokenIn", outVal);
  //   form.setFieldValue("tokenOut", inVal);
  //   form.setFieldValue("amountIn", "");
  // }

  // useEffect(() => {
  //   resetSwap();
  //   form.reset();
  // }, [selectedChain, resetSwap, form]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        {/* ── From ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2 items-center justify-between">
            <p className="text-muted-foreground">From</p>
            <div className="flex flex-row gap-2">
              {(
                [
                  { label: "25%", num: BigInt(1), den: BigInt(4) },
                  { label: "50%", num: BigInt(1), den: BigInt(2) },
                  { label: "75%", num: BigInt(3), den: BigInt(4) },
                  { label: "Max", num: BigInt(1), den: BigInt(1) },
                ] as const
              ).map(({ label }) => (
                <button
                  key={label}
                  type="button"
                  className="text-xs hover:cursor-pointer underline underline-offset-4"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* amount + token picker row */}
          <div className="flex flex-row items-center justify-between gap-2">
            <form.Field name="amountIn">
              {(field) => (
                isDesktop ? (
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="bg-transparent text-2xl outline-none flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    placeholder="0"
                    required
                  />
                ) : (
                  <input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="bg-transparent text-2xl outline-none flex-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    placeholder="0"
                    required
                  />
                )
              )}
            </form.Field>
            <form.Field
              name="tokenIn"
              validators={{
                onChange: ({ value }) =>
                  !value ? "Please select a token to sell" : undefined,
              }}
            >
              {(field) => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={field.state.value}
                  onSelect={(address) => {
                    field.handleChange(address);
                    navigate({ search: (prev) => ({ ...prev, from: address }) });
                  }}
                  disabledAddress={tokenOut}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          <TokenBalanceRow
            tokenAddress={tokenIn}
            tokens={tokens}
            chainId={effectiveChain}
            showRefresh
          />
        </div>

        {/* ── Flip ──────────────────────────────────────────────── */}
        <div className="flex flex-row items-center justify-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-none hover:cursor-pointer"
          >
            <ArrowUpDown />
          </Button>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ── To ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">To</p>

          {/* amount + token picker row */}
          <div className="flex flex-row items-center gap-2">
            <input
              className="bg-transparent text-2xl outline-none flex-1 min-w-0 text-muted-foreground"
              type="text"
              placeholder="0"
              readOnly
              value="0"
            />
            <form.Field name="tokenOut">
              {(field) => (
                <TokenPickerDialog
                  tokens={tokens}
                  value={field.state.value}
                  onSelect={(address) => {
                    field.handleChange(address);
                    navigate({ search: (prev) => ({ ...prev, to: address }) });
                  }}
                  disabledAddress={tokenIn}
                  isLoading={isLoadingTokens}
                />
              )}
            </form.Field>
          </div>

          {/* balance row */}
          <TokenBalanceRow
            tokenAddress={tokenOut}
            tokens={tokens}
            chainId={effectiveChain}
            showRefresh
          />
        </div>
        {/* ── Swap Info ───────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <form.Subscribe selector={(state) => [state.canSubmit]}>
            {([canSubmit]) => (
              <div className="flex flex-row items-center justify-between">
                <Button
                  className="hover:cursor-pointer rounded-none"
                  variant="outline"
                  type="reset"
                  disabled={!canSubmit}
                >
                  <Eraser /> Reset <Kbd>R</Kbd>
                </Button>
                <Button
                  className="hover:cursor-pointer rounded-none"
                  variant="outline"
                  type="button"
                >
                  <Quote /> Get Quotes <Kbd>Q</Kbd>
                </Button>
              </div>
            )}
          </form.Subscribe>
          <RouteSelector onRouteChange={(route) => form.setFieldValue("route", route)} />
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Rate</p>
            <p>0%</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Gas fee</p>
            <p>$0.01</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Max slippage</p>
            <p>0.1%</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Fee</p>
            <p>0.2%</p>
          </div>
          <div className="flex flex-row items-center justify-between text-xs">
            <p className="text-muted-foreground">Approval</p>
            <p>1023020</p>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <form.Subscribe selector={(state) => [state.canSubmit]}>
            {([canSubmit]) => (
              <div className="flex flex-col gap-4">
                {supportsAtomicBatch ? (
                  /* atomic: single swap button */
                  <Button
                    className="hover:cursor-pointer rounded-none w-full"
                    type="submit"
                    disabled={!canSubmit}
                  >
                    Swap
                  </Button>
                ) : (
                  /* non-atomic: approve step + swap step */
                  <>
                    {/* approve row */}
                    <div className="flex flex-row items-center gap-4">
                      <Check className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <Button
                        className="hover:cursor-pointer rounded-none flex-1"
                        variant="outline"
                        type="button"
                        disabled={!canSubmit}
                      >
                        Approve exact <Kbd>E</Kbd>
                      </Button>
                      <Button
                        className="hover:cursor-pointer rounded-none flex-1"
                        variant="outline"
                        type="button"
                        disabled={!canSubmit}
                      >
                        Approve unlimited <Kbd>U</Kbd>
                      </Button>
                    </div>

                    {/* swap row */}
                    <div className="flex flex-row items-center gap-4">
                      <Check className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <Button
                        className="hover:cursor-pointer rounded-none flex-1"
                        type="submit"
                        disabled={!canSubmit}
                      >
                        SWAP <Kbd>S</Kbd>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </form.Subscribe>

          {/* tx status */}
        </div>
      </div>
    </form>
  );
}

type AggregatorRoute = {
  aggregator: string;
  amountOut: string;
  gasUsd: string;
  path: string[];
};

const MOCK_ROUTES: AggregatorRoute[] = [
  { aggregator: "0x",       amountOut: "1842.50", gasUsd: "$0.82", path: ["ETH", "USDC"] },
  { aggregator: "1inch",    amountOut: "1840.12", gasUsd: "$0.91", path: ["ETH", "WETH", "USDC"] },
  { aggregator: "Paraswap", amountOut: "1838.95", gasUsd: "$0.75", path: ["ETH", "USDC"] },
  { aggregator: "Uniswap",  amountOut: "1835.40", gasUsd: "$0.68", path: ["ETH", "WETH", "USDC"] },
];

const BEST_ROUTE = MOCK_ROUTES.reduce((a, b) =>
  parseFloat(a.amountOut) >= parseFloat(b.amountOut) ? a : b
);

function RouteSelector({ onRouteChange }: { onRouteChange?: (route: AggregatorRoute) => void }) {
  const [selected, setSelected] = useState<AggregatorRoute>(BEST_ROUTE);

  return (
    <Accordion className="-mx-0">
      <AccordionItem value="route">
        <AccordionTrigger className="py-0 hover:no-underline">
          <div className="flex flex-1 flex-row items-center justify-between pr-1 text-xs">
            <p className="text-muted-foreground">Route</p>
            <p>{selected.aggregator}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-1 pt-1">
            {MOCK_ROUTES.map((route) => {
              const isBest = route.aggregator === BEST_ROUTE.aggregator;
              const isSelected = route.aggregator === selected.aggregator;
              return (
                <button
                  key={route.aggregator}
                  type="button"
                  onClick={() => { setSelected(route); onRouteChange?.(route); }}
                  className={`flex flex-row items-center justify-between px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:cursor-pointer ${isSelected ? "bg-accent" : ""}`}
                >
                  <div className="flex flex-row items-center gap-2">
                    <Check
                      className={`w-3 h-3 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="font-medium">{route.aggregator}</span>
                    {isBest && (
                      <span className="text-green-500">best</span>
                    )}
                  </div>
                  <div className="flex flex-row items-center gap-4">
                    <span className="text-muted-foreground">{route.path.join(" → ")}</span>
                    <span>{route.amountOut}</span>
                    <span className="text-muted-foreground">{route.gasUsd} gas</span>
                  </div>
                </button>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function TokenBalanceRow({
  tokenAddress,
  tokens,
  chainId,
  showRefresh = false,
}: {
  tokenAddress: string;
  tokens: TokenListToken[];
  chainId: number | null;
  showRefresh?: boolean;
}) {
  const connection = useConnection();
  const isNative = tokenAddress.toLowerCase() === ETH_ADDRESS.toLowerCase();
  const tokenMeta = tokens.find((t) => t.address === tokenAddress);
  const enabled = !!connection.address && !!chainId && !!tokenAddress;

  const { data: ethData, isLoading: isLoadingEth, refetch: refetchEth } = useBalance({
    address: connection.address,
    chainId: chainId ?? undefined,
    query: { enabled: enabled && isNative },
  });

  const { data: erc20Balance, isLoading: isLoadingErc20, refetch: refetchErc20 } = useReadContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connection.address as Address],
    chainId: chainId ?? undefined,
    query: { enabled: enabled && !isNative },
  });

  const isLoading = isNative ? isLoadingEth : isLoadingErc20;
  const refetch = isNative ? refetchEth : refetchErc20;

  const decimals = isNative ? (ethData?.decimals ?? 18) : (tokenMeta?.decimals ?? 18);
  const symbol = isNative ? (ethData?.symbol ?? "ETH") : (tokenMeta?.symbol ?? "");
  const rawBalance = isNative ? ethData?.value : (erc20Balance as bigint | undefined);
  const formatted = rawBalance !== undefined ? formatUnits(rawBalance, decimals) : "0";

  if (!tokenAddress) return null;

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex flex-row gap-2">
        {isLoading ? (
          <Skeleton className="w-16 h-4" />
        ) : (
          <span className="text-muted-foreground">{formatted}</span>
        )}
        <span className="text-muted-foreground">{symbol}</span>
      </div>
      {showRefresh && (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none hover:cursor-pointer"
          type="button"
          onClick={() => refetch()}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function TokenPickerDialog({
  tokens,
  value,
  onSelect,
  disabledAddress,
  isLoading,
}: {
  tokens: TokenListToken[];
  value: string;
  onSelect: (address: string) => void;
  disabledAddress?: string;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");

  const selected = tokens.find((t) => t.address === value);
  const filtered = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog onOpenChange={(open) => { if (!open) setSearch(""); }}>
      <DialogTrigger
        disabled={isLoading}
        render={
          <button
            type="button"
            className="flex items-center gap-1 shrink-0 border border-input px-2.5 py-1.5 text-xs hover:cursor-pointer hover:bg-accent transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          />
        }
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span>{selected ? selected.symbol : "Select"}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select token</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          type="text"
          placeholder="Search by name or symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-input bg-transparent px-2.5 py-2 text-xs outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-col max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No tokens found</p>
          ) : (
            filtered.map((token) => (
              <DialogClose
                key={token.address}
                disabled={token.address === disabledAddress}
                render={
                  <button
                    type="button"
                    onClick={() => onSelect(token.address)}
                    className="flex items-center justify-between px-2.5 py-2 text-xs text-left hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:cursor-pointer"
                  />
                }
              >
                <span className="font-medium">{token.symbol}</span>
                <span className="text-muted-foreground">{token.name}</span>
              </DialogClose>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TokenFieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em className="text-red-400">{field.state.meta.errors.join(",")}</em>
      ) : field.state.meta.isTouched ? (
        <em className="text-green-500">ok!</em>
      ) : null}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}

function AmountFieldInfo({ field }: { field: AnyFieldApi }) {
  return (
    <>
      {!field.state.meta.isTouched ? (
        <em>Please enter an amount to swap</em>
      ) : field.state.meta.isTouched && !field.state.meta.isValid ? (
        <em
          className={
            field.state.meta.errors.join(",") === "Please enter an amount"
              ? ""
              : "text-red-400"
          }
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
