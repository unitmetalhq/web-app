import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"

// --- Web3 ---
import {
  RainbowKitProvider,
  getDefaultConfig,
  lightTheme,
} from "@rainbow-me/rainbowkit"
import { mainnet } from "wagmi/chains"
import { WagmiProvider, http } from "wagmi"
import "@rainbow-me/rainbowkit/styles.css"

// --- Router ---
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { routeTree } from "./routeTree.gen"

// --- State ---
import { Provider as JotaiProvider } from "jotai"

// --- App ---
// import App from "./App.tsx"

// --- Theme ---
import { ThemeProvider } from "@/components/theme-provider.tsx"

// Web3 config
// TO BE MIGRATED TO SELF DEVELOPED CONNECTOR
const config = getDefaultConfig({
  appName: "UnitMetal Web App",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!,
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_RPC_URL_ETHEREUM!),
    // [base.id]: http(import.meta.env.VITE_RPC_URL_BASE!),
    // [arbitrum.id]: http(import.meta.env.VITE_RPC_URL_ARBITRUM!),
  },
})

// Router config
const queryClient = new QueryClient()
const router = createRouter({ routeTree, context: { queryClient } })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
  interface RouterContext {
    queryClient: QueryClient
  }
}

// Render
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <RainbowKitProvider theme={lightTheme({ borderRadius: "none" })}>
            <ThemeProvider>
              <RouterProvider router={router} />
            </ThemeProvider>
          </RainbowKitProvider>
        </JotaiProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
