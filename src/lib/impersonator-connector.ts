// ── Impersonator Connector ────────────────────────────────────────────────────
//
// A read-only wagmi connector that "connects" as any wallet address without
// needing the private key. Useful for inspecting on-chain state as a specific
// address (e.g. debugging, demos, support).
//
// Usage:
//   1. Call setImpersonatorAddress(addr) with the target address.
//   2. Call wagmi's connect({ connector }) with the impersonator connector.
//   3. The connector reads and clears _pendingAddress, stores it in localStorage,
//      and returns it as the active account.
//
// Signing methods are rejected with EIP-1193 code 4200 (unsupported method).
// All read-only RPC calls are proxied to the configured wagmi transport.
// The address persists in localStorage so it survives page reloads.

import { createConnector } from "wagmi";
import type { Address } from "viem";

const STORAGE_KEY = "impersonator.address";

// ── _pendingAddress ───────────────────────────────────────────────────────────
// Module-level mutable variable. The UI writes the target address here before
// calling connect() — the connector reads and clears it in connect().
// This works because setImpersonatorAddress + connect() are always called
// synchronously in the same event handler.
let _pendingAddress: string | null = null;

export function setImpersonatorAddress(address: string): void {
  _pendingAddress = address;
}

// ── impersonatorConnector ─────────────────────────────────────────────────────

export const impersonatorConnector = createConnector((config) => {
  // Methods that require a private key — always rejected.
  const SIGNING_METHODS = new Set([
    "eth_sign",
    "personal_sign",
    "eth_sendTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "wallet_sendCalls",
  ]);

  // ── Provider singleton ──────────────────────────────────────────────────────
  // Built once and reused. The address is read fresh inside each `request()`
  // call (not captured at construction time) so that a new impersonation
  // after connect() is reflected without rebuilding the provider.
  let _provider: {
    request: (args: { method: string; params?: unknown }) => Promise<unknown>;
    on: (event: string, handler: unknown) => void;
    removeListener: (event: string, handler: unknown) => void;
  } | null = null;

  function buildProvider() {
    const chain = config.chains[0];
    const transport = config.transports?.[chain.id];

    return {
      request: async ({ method, params }: { method: string; params?: unknown }) => {
        const address = localStorage.getItem(STORAGE_KEY);

        if (method === "eth_accounts" || method === "eth_requestAccounts") {
          return address ? [address] : [];
        }

        if (method === "eth_chainId") {
          return `0x${chain.id.toString(16)}`;
        }

        if (SIGNING_METHODS.has(method)) {
          const err = new Error(
            `Impersonator: method "${method}" not supported (read-only mode)`
          );
          (err as unknown as { code: number }).code = 4200;
          throw err;
        }

        // Proxy all read calls to the configured HTTP transport.
        if (!transport) throw new Error(`No transport configured for chain ${chain.id}`);
        const { request } = transport({ chain, retryCount: 0 });
        return request({ method, params } as Parameters<typeof request>[0]);
      },
      on: (_event: string, _handler: unknown) => {},
      removeListener: (_event: string, _handler: unknown) => {},
    };
  }

  return {
    id: "impersonator",
    name: "Impersonator",
    type: "impersonator",

    // ── connect ───────────────────────────────────────────────────────────────
    // Reads _pendingAddress (new connection) or falls back to localStorage
    // (page-reload reconnection via isAuthorized → connect({ isReconnecting })).
    async connect() {
      const addr = _pendingAddress ?? localStorage.getItem(STORAGE_KEY);
      _pendingAddress = null; // consume immediately

      if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        throw new Error("Impersonator: no valid address provided");
      }

      localStorage.setItem(STORAGE_KEY, addr);
      return { accounts: [addr as Address], chainId: config.chains[0].id };
    },

    async disconnect() {
      localStorage.removeItem(STORAGE_KEY);
    },

    async getAccounts() {
      const addr = localStorage.getItem(STORAGE_KEY);
      return addr ? [addr as Address] : [];
    },

    async getChainId() {
      return config.chains[0].id;
    },

    async getProvider() {
      if (!_provider) _provider = buildProvider();
      return _provider;
    },

    // ── isAuthorized ──────────────────────────────────────────────────────────
    // Called by wagmi's reconnect logic on page load. Returns true if an
    // address is stored, triggering auto-reconnect via connect({ isReconnecting }).
    async isAuthorized() {
      return localStorage.getItem(STORAGE_KEY) !== null;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      localStorage.removeItem(STORAGE_KEY);
      config.emitter.emit("disconnect");
    },
  };
});
