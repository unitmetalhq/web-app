import { createFileRoute } from '@tanstack/react-router'
import SendComponent from '@/components/send-component'
import BalancesComponent from '@/components/balances-component'

export const Route = createFileRoute('/send')({
  component: SendPage,
})

function SendPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
      <SendComponent />
      <BalancesComponent />
    </div>
  )
}
