// ── WalletConnectButton ───────────────────────────────────────────────────────
//
// Replaces RainbowKit's ConnectButton. Renders a small button in the header
// that opens a dialog for connecting/disconnecting wallets.
//
// Disconnected → "Connect" button → dialog with:
//   - List of available wallets (EIP-6963 auto-detected + injected fallback)
//   - Impersonator section: recent addresses (quick-select) + paste new address
//
// Connected → truncated address button → dialog with:
//   - Full address display
//   - "view" badge if in impersonator mode
//   - Disconnect button

import { useState } from "react";
import { useConnection, useConnect, useConnectors, useDisconnect, useEnsAddress } from "wagmi";
import { isAddress } from "viem";
import { normalize } from "viem/ens";
import { useForm, useStore, type AnyFieldApi } from "@tanstack/react-form";
import { Check, Copy, EllipsisVertical, Loader2, Search, View } from "lucide-react";
import { setImpersonatorAddress } from "@/lib/impersonator-connector";
import { truncateAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import QrScannerButton from "@/components/qr-scanner-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ── History helpers ───────────────────────────────────────────────────────────
// Addresses are stored newest-first, deduplicated. No cap on stored count.

const HISTORY_KEY = "impersonator.history";

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToHistory(address: string): string[] {
  const prev = loadHistory().filter((a) => a.toLowerCase() !== address.toLowerCase());
  const next = [address, ...prev];
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function removeFromHistory(address: string): string[] {
  const next = loadHistory().filter((a) => a.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

// ── WalletConnectButton ───────────────────────────────────────────────────────

export function WalletConnectButton() {
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();

  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  // Tracks which history row has its delete menu open.
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  // Connection-level error (connector not available, wallet rejected, etc.)
  const [connectError, setConnectError] = useState<string | null>(null);

  const isImpersonator = connection.connector?.id === "impersonator";
  const [copied, setCopied] = useState(false);

  // ── TanStack Form for the impersonator address input ──────────────────────
  const impersonatorForm = useForm({
    defaultValues: { address: "" },
    onSubmit: ({ value }) => {
      const trimmed = value.address.trim();
      if (trimmed.endsWith(".eth")) {
        if (!ensAddress) {
          // ENS not yet resolved — trigger lookup first
          void refetchEnsAddress();
          return;
        }
        connectAsAddress(ensAddress);
      } else {
        connectAsAddress(trimmed);
      }
    },
  });

  // Watch address field reactively for ENS lookup
  const addressInput = useStore(impersonatorForm.store, (s) => s.values.address);

  // ── ENS lookup ────────────────────────────────────────────────────────────
  const isEnsName = addressInput.trim().endsWith(".eth") && addressInput.trim().length > 4;
  const {
    data: ensAddress,
    isLoading: isLoadingEnsAddress,
    isError: isErrorEnsAddress,
    refetch: refetchEnsAddress,
  } = useEnsAddress({
    chainId: 1,
    name: isEnsName ? normalize(addressInput.trim()) : undefined,
    query: { enabled: false },
  });

  function handleCopyAddress() {
    if (!connection.address) return;
    navigator.clipboard.writeText(connection.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── connectAsAddress ──────────────────────────────────────────────────────
  // Core connect logic used by both the form submit and history quick-select.
  function connectAsAddress(addr: string) {
    const connector = connectors.find((c) => c.id === "impersonator");
    if (!connector) {
      setConnectError("Impersonator connector not available");
      return;
    }
    setConnectError(null);
    setImpersonatorAddress(addr);
    connect.mutate(
      { connector },
      {
        onSuccess: () => {
          setHistory(saveToHistory(addr));
          setOpen(false);
          impersonatorForm.reset();
          setConnectError(null);
          setMenuOpenFor(null);
        },
        onError: (err) => {
          setConnectError(err.message);
        },
      }
    );
  }

  function handleRemove(addr: string) {
    setHistory(removeFromHistory(addr));
    setMenuOpenFor(null);
  }

  function handleClose() {
    impersonatorForm.reset();
    setConnectError(null);
    setMenuOpenFor(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) handleClose();
      }}
    >
      {/* ── Trigger button ────────────────────────────────────────────────── */}
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs rounded-none h-8 hover:cursor-pointer"
          />
        }
      >
        {connection.isConnected ? (
          <span className="flex items-center gap-1.5">
            {truncateAddress(connection.address)}
            {isImpersonator && (
              <Badge className="text-[10px] px-1 py-0 rounded-none">
                <View />
              </Badge>
            )}
          </span>
        ) : (
          "Connect"
        )}
      </DialogTrigger>

      <DialogContent>
        {connection.isConnected ? (
          // ── Connected view ─────────────────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle>Connected</DialogTitle>
            </DialogHeader>

            <div className="flex flex-row gap-2 items-center">
              <p className="font-mono text-xs break-all text-muted-foreground underline underline-offset-4">
                {connection.address}
              </p>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="text-muted-foreground hover:text-foreground transition-colors hover:cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {isImpersonator && (
              <Badge variant="outline" className="w-fit rounded-none">
                Read-only
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              className="rounded-none w-full"
              onClick={() => {
                disconnect.mutate({});
                setOpen(false);
              }}
            >
              Disconnect
            </Button>
          </>
        ) : (
          // ── Disconnected view ──────────────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle>Connect wallet</DialogTitle>
            </DialogHeader>
            <h2 className="text-xs text-muted-foreground">
              Extension
            </h2>
            {/* Detected wallets (EIP-6963 + injected fallback) */}
            <div className="flex flex-col gap-1">
              {connectors
                .filter((c) => c.id !== "impersonator")
                .map((connector) => (
                  <button
                    key={connector.uid}
                    type="button"
                    disabled={connect.isPending}
                    className="flex items-center gap-2 px-2.5 py-2 text-xs text-left border border-input hover:bg-accent transition-colors disabled:opacity-50 hover:cursor-pointer"
                    onClick={() => {
                      connect.mutate({ connector });
                      setOpen(false);
                    }}
                  >
                    {connector.icon && (
                      <img src={connector.icon} alt="" className="w-4 h-4 shrink-0" />
                    )}
                    <span>{connector.name}</span>
                  </button>
                ))}
            </div>

            {/* Impersonator section */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">
                View wallets — no signing
              </span>

              {/* ── Recent addresses ─────────────────────────────────────── */}
              {history.length > 0 && (
                <div className="flex flex-col max-h-40 overflow-y-auto border border-input">
                  {history.map((addr) => (
                    <div
                      key={addr}
                      className="flex items-center group"
                    >
                      {/* Quick-select: click row to connect immediately */}
                      <button
                        type="button"
                        disabled={connect.isPending}
                        className="flex-1 px-2.5 py-1.5 text-left text-xs font-mono hover:bg-accent transition-colors disabled:opacity-50 hover:cursor-pointer truncate"
                        onClick={() => {
                          if (menuOpenFor === addr) {
                            setMenuOpenFor(null);
                          } else {
                            connectAsAddress(addr);
                          }
                        }}
                      >
                        {truncateAddress(addr)}
                      </button>

                      {/* Ellipsis menu — extra click required before delete appears */}
                      {menuOpenFor === addr ? (
                        <button
                          type="button"
                          className="px-2 py-1.5 text-xs text-destructive hover:bg-accent transition-colors hover:cursor-pointer shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(addr);
                          }}
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="px-2 py-1.5 text-muted-foreground hover:bg-accent transition-colors hover:cursor-pointer shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenFor(addr);
                          }}
                        >
                          <EllipsisVertical className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Address input with ENS + QR ───────────────────────────── */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  impersonatorForm.handleSubmit();
                }}
                className="flex flex-col gap-1.5"
              >
                <impersonatorForm.Field
                  name="address"
                  validators={{
                    onChange: ({ value }) => {
                      if (!value.trim()) return "Please enter an address or ENS";
                      const trimmed = value.trim();
                      if (!trimmed.endsWith(".eth") && !isAddress(trimmed)) {
                        return "Invalid address or ENS name";
                      }
                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <>
                      <InputGroup>
                        <InputGroupInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Address (0x...) or ENS (.eth)"
                          className="font-mono text-xs"
                          aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            type="button"
                            aria-label="ENS lookup"
                            size="icon-xs"
                            onClick={() => refetchEnsAddress()}
                            className="hover:cursor-pointer"
                            disabled={!isEnsName}
                          >
                            {isLoadingEnsAddress ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Search className="w-3.5 h-3.5" />
                            )}
                          </InputGroupButton>
                          <QrScannerButton
                            onScan={(addr) => field.handleChange(addr)}
                          />
                        </InputGroupAddon>
                      </InputGroup>
                      <ImpersonatorAddressFieldInfo
                        field={field}
                        ensAddress={ensAddress}
                        isLoadingEnsAddress={isLoadingEnsAddress}
                        isErrorEnsAddress={isErrorEnsAddress}
                      />
                    </>
                  )}
                </impersonatorForm.Field>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="rounded-none w-full hover:cursor-pointer"
                  disabled={connect.isPending}
                >
                  {connect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "View"}
                </Button>
                {connectError && (
                  <span className="text-xs text-destructive">{connectError}</span>
                )}
              </form>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── ImpersonatorAddressFieldInfo ──────────────────────────────────────────────
// Shows field validation state, ENS resolution result, and ENS errors.

function ImpersonatorAddressFieldInfo({
  field,
  ensAddress,
  isLoadingEnsAddress,
  isErrorEnsAddress,
}: {
  field: AnyFieldApi;
  ensAddress?: `0x${string}` | null;
  isLoadingEnsAddress?: boolean;
  isErrorEnsAddress?: boolean;
}) {
  if (!field.state.meta.isTouched) return null;
  if (field.state.meta.isTouched && !field.state.meta.isValid) {
    return (
      <em className="text-xs text-destructive">
        {field.state.meta.errors.join(", ")}
      </em>
    );
  }
  if (isLoadingEnsAddress) return <Skeleton className="w-32 h-3" />;
  if (isErrorEnsAddress) return <em className="text-xs text-destructive">Failed to resolve ENS</em>;
  if (ensAddress) return <em className="text-xs text-green-500">{ensAddress}</em>;
  if (ensAddress === null) return <em className="text-xs text-destructive">ENS name not found</em>;
  return <em className="text-xs text-green-500">ok!</em>;
}
