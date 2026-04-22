import { memo, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { Loader2, ChevronDown, BadgeCheck } from "lucide-react";
import { customTokensAtom } from "@/atoms/customTokensAtom";
import { tokenBalancesAtom } from "@/atoms/tokenBalancesAtom";
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

function TokenRow({
  token,
  disabled,
  onSelect,
}: {
  token: TokenListToken & { isVerified: boolean };
  disabled: boolean;
  onSelect: (address: string) => void;
}) {
  return (
    <DialogClose
      disabled={disabled}
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
  );
}

export const TokenPickerDialog = memo(function TokenPickerDialog({
  tokens,
  value,
  onSelect,
  disabledAddress,
  isLoading,
}: {
  tokens: TokenListToken[];
  value: string | undefined;
  onSelect: (address: string) => void;
  disabledAddress?: string;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");

  const customTokens = useAtomValue(customTokensAtom);
  const tokenBalances = useAtomValue(tokenBalancesAtom);

  // Derive chainId from the passed list — all tokens are pre-filtered to the
  // same chain by the caller, so the first entry is representative.
  const chainId = tokens[0]?.chainId;

  // ── Merge custom tokens ───────────────────────────────────────────────────
  const allTokens = useMemo<(TokenListToken & { isVerified: boolean })[]>(() => {
    const customForChain = customTokens.filter((t) => t.chainId === chainId);
    const dedupedCustom = customForChain.filter(
      (ct) => !tokens.some((lt) => lt.address.toLowerCase() === ct.address.toLowerCase())
    );
    return [
      ...tokens.map((t) => ({ ...t, isVerified: t.isVerified ?? true })),
      ...dedupedCustom.map((t) => ({ ...t, isVerified: false })),
    ];
  }, [tokens, customTokens, chainId]);

  const selected = useMemo(
    () => value ? allTokens.find((t) => t.address.toLowerCase() === value.toLowerCase()) : undefined,
    [allTokens, value],
  );

  // ── Split into "your tokens" (balance > 0) and "other tokens" ────────────
  const { yourTokens, otherTokens } = useMemo(() => {
    const q = search.toLowerCase();
    const matches = (t: TokenListToken) =>
      t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);

    const yours: (TokenListToken & { isVerified: boolean })[] = [];
    const others: (TokenListToken & { isVerified: boolean })[] = [];

    for (const t of allTokens) {
      if (!matches(t)) continue;
      const bal = tokenBalances.get(t.address.toLowerCase()) ?? 0n;
      if (bal > 0n) yours.push(t);
      else others.push(t);
    }

    yours.sort((a, b) => {
      const balA = tokenBalances.get(a.address.toLowerCase())!;
      const balB = tokenBalances.get(b.address.toLowerCase())!;
      return balA > balB ? -1 : balA < balB ? 1 : 0;
    });

    return { yourTokens: yours, otherTokens: others };
  }, [allTokens, tokenBalances, search]);

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
          {yourTokens.length === 0 && otherTokens.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No tokens found</p>
          ) : (
            <>
              {yourTokens.length > 0 && (
                <>
                  <p className="px-2.5 py-1 text-xs text-muted-foreground border-b border-accent">Your tokens</p>
                  {yourTokens.map((token) => (
                    <TokenRow
                      key={token.address}
                      token={token}
                      disabled={token.address === disabledAddress}
                      onSelect={onSelect}
                    />
                  ))}
                </>
              )}
              {otherTokens.length > 0 && (
                <>
                  <p className="px-2.5 py-1 text-xs text-muted-foreground border-b border-accent mt-2">Other tokens</p>
                  {otherTokens.map((token) => (
                    <TokenRow
                      key={token.address}
                      token={token}
                      disabled={token.address === disabledAddress}
                      onSelect={onSelect}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
