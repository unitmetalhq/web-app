import { useForm, useStore } from "@tanstack/react-form";
import { useAtom } from "jotai";
import { customTokensAtom } from "@/lib/atoms/custom-token-list";
import { useReadContracts, useConnection } from "wagmi";
import { isAddress, erc20Abi, type Address } from "viem";
import { Loader2, Plus, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CustomTokenComponent() {
  const connection = useConnection();
  const [customTokens, setCustomTokens] = useAtom(customTokensAtom);

  const form = useForm({
    defaultValues: { address: "" },
    onSubmit: ({ value }) => {
      if (!name || !symbol || decimals === undefined || !connection.chain) return;
      const addr = value.address as Address;
      setCustomTokens((prev) => [
        ...prev,
        {
          chainId: connection.chain!.id,
          address: addr,
          name,
          symbol,
          decimals,
        },
      ]);
      form.reset();
    },
  });

  const addressValue = useStore(form.store, (s) => s.values.address);
  const validAddress = isAddress(addressValue) ? (addressValue as Address) : null;

  const { data: tokenData, isLoading, isFetched } = useReadContracts({
    contracts: validAddress
      ? [
          { address: validAddress, abi: erc20Abi, functionName: "name" as const },
          { address: validAddress, abi: erc20Abi, functionName: "symbol" as const },
          { address: validAddress, abi: erc20Abi, functionName: "decimals" as const },
        ]
      : [],
    query: { enabled: !!validAddress },
  });

  const name = tokenData?.[0]?.status === "success" ? (tokenData[0].result as string) : undefined;
  const symbol = tokenData?.[1]?.status === "success" ? (tokenData[1].result as string) : undefined;
  const decimals = tokenData?.[2]?.status === "success" ? (tokenData[2].result as number) : undefined;
  const isResolved = !!name && !!symbol && decimals !== undefined;
  const isNotFound = isFetched && validAddress && !isResolved;

  const alreadyAdded =
    !!validAddress &&
    customTokens.some(
      (t) =>
        t.address.toLowerCase() === validAddress.toLowerCase() &&
        t.chainId === connection.chain?.id
    );

  return (
    <div className="flex flex-col border-2 border-primary gap-2 pb-4">
      <div className="bg-primary text-secondary px-2 py-1">
        <h1 className="text-md font-bold">Add custom token</h1>
      </div>

      <form
        className="flex flex-col gap-3 px-4 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* address field */}
        <form.Field
          name="address"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Enter a token contract address";
              if (!isAddress(value)) return "Invalid address";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Contract address</label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="0x..."
                className="rounded-none h-8 text-xs font-mono"
              />
              {field.state.meta.isTouched && !field.state.meta.isValid && (
                <span className="text-xs text-red-400">
                  {field.state.meta.errors.join(", ")}
                </span>
              )}
            </div>
          )}
        </form.Field>

        {/* token info preview */}
        {validAddress && (
          <div className="border p-3 flex flex-col gap-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Fetching token info…
              </div>
            )}

            {isNotFound && (
              <span className="text-xs text-red-400">No ERC20 token found at this address</span>
            )}

            {isResolved && (
              <div className="flex flex-col gap-1.5">
                <Row label="Name" value={name} />
                <Row label="Symbol" value={symbol} />
                <Row label="Decimals" value={String(decimals)} />
                <Row label="Chain" value={connection.chain?.name ?? "—"} />
              </div>
            )}
          </div>
        )}

        {alreadyAdded && (
          <div className="flex items-center gap-1.5 text-xs text-green-500">
            <CheckCircle className="w-3.5 h-3.5" />
            Already in your custom token list
          </div>
        )}

        <form.Subscribe selector={(s) => [s.canSubmit]}>
          {([canSubmit]) => (
            <Button
              type="submit"
              className="rounded-none w-full hover:cursor-pointer"
              disabled={!canSubmit || !isResolved || alreadyAdded}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add token
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
