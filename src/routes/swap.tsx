import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/swap')({
  component: SwapPage,
})

function SwapPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1>Swap is coming soon!</h1>
    </div>
  )
}
