import { createFileRoute } from '@tanstack/react-router'
import SwapComponent from '@/components/swap-component'
import BalancesComponent from '@/components/balances-component'


// Native ETH address per EIP-7528: https://eips.ethereum.org/EIPS/eip-7528
const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

export const Route = createFileRoute('/swap')({
  component: SwapPage,
  validateSearch: (search: Record<string, unknown>) => ({
    chain: Number(search.chain) || 1,
    from: String(search.from ?? ETH_ADDRESS),
    to: String(search.to ?? USDC_MAINNET),
  }),
})

function SwapPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
      <SwapComponent />
      <BalancesComponent />
    </div>
  )
}
