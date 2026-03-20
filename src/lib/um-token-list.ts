import type { Token } from "@/types/token"

export type { Token }

export const TOKENS: Record<number, Token[]> = {
  // ── Ethereum Mainnet ────────────────────────────────────────────────────────
  1: [
    // Stablecoins
    {
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    },
    // Wrapped assets
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    },
    {
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      decimals: 8,
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    },
    // Liquid staking
    {
      symbol: "stETH",
      name: "Lido Staked ETH",
      decimals: 18,
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    },
    {
      symbol: "wstETH",
      name: "Wrapped stETH",
      decimals: 18,
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    },
    {
      symbol: "rETH",
      name: "Rocket Pool ETH",
      decimals: 18,
      address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    },
    {
      symbol: "cbETH",
      name: "Coinbase Wrapped ETH",
      decimals: 18,
      address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    },
    // DeFi blue chips
    {
      symbol: "UNI",
      name: "Uniswap",
      decimals: 18,
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    },
    {
      symbol: "AAVE",
      name: "Aave",
      decimals: 18,
      address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    },
    {
      symbol: "MKR",
      name: "Maker",
      decimals: 18,
      address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    },
    {
      symbol: "CRV",
      name: "Curve DAO Token",
      decimals: 18,
      address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    },
    {
      symbol: "LDO",
      name: "Lido DAO Token",
      decimals: 18,
      address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    },
    {
      symbol: "COMP",
      name: "Compound",
      decimals: 18,
      address: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
    },
    {
      symbol: "SNX",
      name: "Synthetix Network",
      decimals: 18,
      address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    },
    {
      symbol: "BAL",
      name: "Balancer",
      decimals: 18,
      address: "0xba100000625a3754423978a60c9317c58a424e3D",
    },
    {
      symbol: "1INCH",
      name: "1inch",
      decimals: 18,
      address: "0x111111111117dC0aa78b770fA6A738034120C302",
    },
    // Infrastructure / other
    {
      symbol: "LINK",
      name: "Chainlink",
      decimals: 18,
      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    },
    {
      symbol: "ENS",
      name: "Ethereum Name Service",
      decimals: 18,
      address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
    },
    {
      symbol: "GRT",
      name: "The Graph",
      decimals: 18,
      address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7",
    },
    {
      symbol: "RPL",
      name: "Rocket Pool",
      decimals: 18,
      address: "0xD33526068D116cE69F19A9ee46F0bd304F21A51f",
    },
    {
      symbol: "ARB",
      name: "Arbitrum",
      decimals: 18,
      address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
    },
  ],

  // ── Base ────────────────────────────────────────────────────────────────────
  8453: [
    // Stablecoins
    {
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    {
      symbol: "USDbC",
      name: "USD Base Coin",
      decimals: 6,
      address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    },
    // Wrapped assets
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0x4200000000000000000000000000000000000006",
    },
    {
      symbol: "cbBTC",
      name: "Coinbase Wrapped BTC",
      decimals: 8,
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    },
    // Liquid staking
    {
      symbol: "cbETH",
      name: "Coinbase Wrapped ETH",
      decimals: 18,
      address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    },
    {
      symbol: "wstETH",
      name: "Wrapped stETH",
      decimals: 18,
      address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
    },
    {
      symbol: "rETH",
      name: "Rocket Pool ETH",
      decimals: 18,
      address: "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c",
    },
    // Base-native
    {
      symbol: "AERO",
      name: "Aerodrome Finance",
      decimals: 18,
      address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    },
    {
      symbol: "DEGEN",
      name: "Degen",
      decimals: 18,
      address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    },
  ],

  // ── Arbitrum One ────────────────────────────────────────────────────────────
  42161: [
    // Stablecoins
    {
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    {
      symbol: "USDC.e",
      name: "USD Coin (Bridged)",
      decimals: 6,
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    },
    // Wrapped assets
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
    {
      symbol: "WBTC",
      name: "Wrapped Bitcoin",
      decimals: 8,
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    },
    // Liquid staking
    {
      symbol: "wstETH",
      name: "Wrapped stETH",
      decimals: 18,
      address: "0x5979D7b546E38E414F7E9822514be443A4800529",
    },
    {
      symbol: "rETH",
      name: "Rocket Pool ETH",
      decimals: 18,
      address: "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
    },
    // DeFi / Arbitrum-native
    {
      symbol: "ARB",
      name: "Arbitrum",
      decimals: 18,
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    },
    {
      symbol: "GMX",
      name: "GMX",
      decimals: 18,
      address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
    },
    {
      symbol: "LINK",
      name: "Chainlink",
      decimals: 18,
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
    },
    {
      symbol: "UNI",
      name: "Uniswap",
      decimals: 18,
      address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
    },
    {
      symbol: "GRT",
      name: "The Graph",
      decimals: 18,
      address: "0x9623063377AD1B27544C965cCd7342f7EA7e88C7",
    },
  ],

  // ── Unichain ────────────────────────────────────────────────────────────────
  // TODO: verify addresses against https://app.uniswap.org or the official bridge
  130: [
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0x4200000000000000000000000000000000000006",
    },
  ],
}
