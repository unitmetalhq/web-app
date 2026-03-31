# Unitmetal

A power app for Ethereum and EVM-compatible chains. Swap tokens and batch-send ETH, ERC20, and ERC721 tokens in a single transaction.

## Features

- **Swap** — Token swaps via the ZFI aggregator with configurable slippage
- **Batch Send ETH** — Send ETH to multiple recipients in one transaction
- **Batch Send ERC20** — Distribute any ERC20 token to multiple addresses
- **Batch Send ERC721** — Send multiple NFTs to multiple recipients
- ENS name resolution for recipient addresses

## Supported Chains

- Ethereum Mainnet

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:
   ```env
   VITE_MAINNET_RPC_URL=
   VITE_BASE_RPC_URL=
   VITE_ARBITRUM_RPC_URL=
   VITE_UNICHAIN_RPC_URL=
   VITE_WALLETCONNECT_PROJECT_ID=
   ```

3. Start the dev server:
   ```bash
   bun dev
   ```

## Commands

```bash
bun dev        # Start dev server
bun build      # Type-check + build for production
bun lint       # Run ESLint
bun typecheck  # Type-check without building
bun format     # Format all TS/TSX files with Prettier
```

## Stack

- **React 19** + TypeScript + Vite
- **Tailwind CSS v4** + shadcn/ui
- **TanStack Router** (file-based) + TanStack Query
- **wagmi** + viem + RainbowKit
- **Jotai** for global state
