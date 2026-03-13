# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start dev server
bun build        # Type-check + build for production
bun lint         # Run ESLint
bun typecheck    # Type-check without building
bun format       # Format all TS/TSX files with Prettier
```

No test runner is configured yet.

## Architecture

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Router + wagmi/viem + RainbowKit + Jotai

**Entry point:** `src/main.tsx` wraps the app in:
1. `Providers` (`src/providers.tsx`) — wagmi + TanStack Query + Jotai + RainbowKit
2. `ThemeProvider` (`src/components/theme-provider.tsx`) — dark/light/system theme, persisted to localStorage; press `d` to toggle

**Routing:** File-based routing via `@tanstack/react-router`. Routes live under `src/routes/` (not yet created). The router expects a `routeTree` generated at `src/routeTree.gen.ts` by the `@tanstack/router-plugin` — this file is auto-generated and should not be edited manually. The router receives `queryClient` via context for data loading.

**Web3:** `src/providers.tsx` configures wagmi with RainbowKit for wallet connection. Supported chains: mainnet, Base, Arbitrum, Unichain. RPC URLs are injected via env vars (`VITE_MAINNET_RPC_URL`, `VITE_BASE_RPC_URL`, `VITE_ARBITRUM_RPC_URL`, `VITE_UNICHAIN_RPC_URL`). WalletConnect requires `VITE_WALLETCONNECT_PROJECT_ID`. A custom connector is planned to replace RainbowKit (see commented-out code in `providers.tsx`).

**State:** Jotai for global client state. TanStack Query (via wagmi) for server/chain state.

**UI components:** shadcn/ui components in `src/components/ui/`. Add new shadcn components with `bunx shadcn add <component>`. Utility: `src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge).

**Path alias:** `@/` resolves to `src/`.
