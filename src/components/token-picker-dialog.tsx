import { useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ── TokenListToken ────────────────────────────────────────────────────────────
// Shape of a single entry in /token-list.json. Shared between the swap
// component and any other component that needs to pick from the token list.

export type TokenListToken = {
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
};

// ── TokenPickerDialog ─────────────────────────────────────────────────────────
//
// A trigger button + modal dialog for selecting a token from the token list.
// The trigger shows the selected token's symbol (or "Select" if none), with a
// chevron. Inside the dialog, the user can search by name or symbol and click
// a row to confirm the selection.
//
// Props:
//   tokens          — full token list to display/filter
//   value           — currently selected token address (or "")
//   onSelect        — called with the chosen token's address
//   disabledAddress — address of the token that should be un-selectable
//                     (e.g. the other side of a swap pair)
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

  const selected = tokens.find((t) => t.address === value);
  const filtered = tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    // Clear search when the dialog closes so it's blank on next open.
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
