import { createFileRoute } from '@tanstack/react-router'
import SwapComponent from '@/components/swap-component'
import BalancesComponent from '@/components/balances-component'


export const Route = createFileRoute('/swap')({
  component: SwapPage,
  validateSearch: (search: Record<string, unknown>) => ({
    chain: Number(search.chain) || 1,
    from: search.from ? String(search.from) : undefined,
    to: search.to ? String(search.to) : undefined,
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
