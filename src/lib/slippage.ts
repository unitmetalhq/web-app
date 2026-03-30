// ── Slippage defaults ─────────────────────────────────────────────────────────
//
// Token symbol sets used to tier default slippage before a quote is fetched.
// Add symbols here as new tokens / aggregators are supported.

export const STABLECOINS = new Set([
  "USDC", "USDT", "DAI", "FRAX", "LUSD", "BUSD", "USDP", "GUSD", "TUSD",
  "USDD", "crvUSD", "GHO",
]);

export const MAJORS = new Set([
  "ETH", "WETH", "WBTC", "cbETH", "stETH", "wstETH", "rETH",
]);

// ── defaultSlippage ───────────────────────────────────────────────────────────
//
// Returns a default slippage percentage string based on token symbols.
//
// Tiers:
//   Both stablecoins → "0.1"   tight peg, minimal price movement
//   Either is a major → "0.5"  liquid, moderate movement
//   Anything else    → "1.0"   long tail, higher volatility

export function defaultSlippage(
  symbolIn: string | undefined,
  symbolOut: string | undefined,
): string {
  const a = symbolIn?.toUpperCase() ?? "";
  const b = symbolOut?.toUpperCase() ?? "";
  if (STABLECOINS.has(a) && STABLECOINS.has(b)) return "0.1";
  if (MAJORS.has(a) || MAJORS.has(b)) return "0.5";
  return "1.0";
}

// ── slippageToBps ─────────────────────────────────────────────────────────────
//
// Converts a slippage percentage string to basis points (integer).
// e.g. "0.5" → 50,  "1.0" → 100
// Used when passing slippage to aggregator APIs that expect bps.

export function slippageToBps(slippage: string): number {
  return Math.round(parseFloat(slippage) * 100);
}
