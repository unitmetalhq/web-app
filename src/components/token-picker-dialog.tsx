import { useState } from "react";
import { useAtomValue } from "jotai";
import { useReadContracts, useConnection } from "wagmi";
import { erc20Abi } from "viem";
import type { Address } from "viem";
import { Loader2, ChevronDown, BadgeCheck } from "lucide-react";
import { customTokensAtom } from "@/atoms/customTokensAtom";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ── TokenListToken ────────────────────────────────────────────────────────────
// Shape of a single entry in /token-list.json. Shared between the token picker
// and any other component that needs to pick from the token list.
// isVerified is optional — callers don't need to set it; the dialog defaults
// list-sourced tokens to true and custom tokens to false.

export type TokenListToken = {
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  isVerified?: boolean;
};

// ── TokenPickerDialog ─────────────────────────────────────────────────────────
//
// A trigger button + modal dialog for selecting a token from the token list.
// The trigger shows the selected token's symbol (or "Select" if none), with a
// chevron. Inside the dialog, the user can search by name or symbol and click
// a row to confirm the selection.
//
// Internally the dialog:
//   • Merges custom tokens (from customTokensAtom) deduplicated against the
//     passed list — so custom-added tokens appear without duplicates.
//   • Fetches balanceOf for all tokens and sorts non-zero-balance tokens first
//     (descending), falling back to list order for zero-balance tokens.
//   • Shows a BadgeCheck icon for verified (list-sourced) tokens.
//
// Props:
//   tokens          — token list filtered to the current chain by the caller
//   value           — currently selected token address (or "")
//   onSelect        — called with the chosen token's address
//   disabledAddress — address that should be un-selectable (e.g. swap pair)
//   isLoading       — shows a spinner on the trigger while the list loads

export function TokenPickerDialog({
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

  const { address } = useConnection();
  const customTokens = useAtomValue(customTokensAtom);

  // Derive chainId from the passed list — all tokens are pre-filtered to the
  // same chain by the caller, so the first entry is representative.
  const chainId = tokens[0]?.chainId;

  // ── Merge custom tokens ───────────────────────────────────────────────────
  // Filter custom tokens to the same chain and remove any already in the list.
  const customForChain = customTokens.filter((t) => t.chainId === chainId);
  const dedupedCustom = customForChain.filter(
    (ct) => !tokens.some((lt) => lt.address.toLowerCase() === ct.address.toLowerCase())
  );

  const allTokens: (TokenListToken & { isVerified: boolean })[] = [
    ...tokens.map((t) => ({ ...t, isVerified: t.isVerified ?? true })),
    ...dedupedCustom.map((t) => ({ ...t, isVerified: false })),
  ];

  // ── Balance query ─────────────────────────────────────────────────────────
  // Same contracts array order as balances-component.tsx → shared wagmi cache.
  const { data: tokenBalances } = useReadContracts({
    contracts: allTokens.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address!] as [Address],
      chainId,
    })),
    query: {
      enabled: !!address && !!chainId && allTokens.length > 0,
      refetchOnMount: false,
    },
  });

  const balanceMap = new Map<string, bigint>();
  allTokens.forEach((token, i) => {
    const raw = tokenBalances?.[i];
    if (raw?.status === "success") {
      balanceMap.set(token.address.toLowerCase(), raw.result as bigint);
    }
  });

  // ── Sort: non-zero balance first (desc), then preserve list order ─────────
  const sortedTokens = [...allTokens].sort((a, b) => {
    const balA = balanceMap.get(a.address.toLowerCase()) ?? 0n;
    const balB = balanceMap.get(b.address.toLowerCase()) ?? 0n;
    if (balA > 0n && balB === 0n) return -1;
    if (balA === 0n && balB > 0n) return 1;
    if (balA !== balB) return balA > balB ? -1 : 1;
    return 0;
  });

  // Use allTokens (unsorted) for the selected label so it doesn't flicker
  // while balances are loading.
  const selected = allTokens.find(
    (t) => t.address.toLowerCase() === value.toLowerCase()
  );

  const filtered = sortedTokens.filter(
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
                <div className="flex items-center gap-1">
                  <span className="font-medium">{token.symbol}</span>
                  {token.isVerified && (
                    <BadgeCheck className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
                <span className="text-muted-foreground">{token.name}</span>
              </DialogClose>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
