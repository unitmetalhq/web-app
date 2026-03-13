import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { IndexSupply } from 'idxs'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { QueryEditor } from '@/components/query-editor'
import { SignaturesInput } from '@/components/signatures-input'
import { QueryResult } from '@/components/query-result'

export const Route = createFileRoute('/queries')({
  component: QueryPage,
})

const is = IndexSupply.create()

const RATE_LIMIT = 5
const RESET_INTERVAL = 60 // seconds

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  return value
}

function useResolvedTheme() {
  const { theme } = useTheme()
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

type FetchParams = {
  query: string
  signatures?: IndexSupply.Signature[]
  cursor?: string
}

function QueryPage() {
  const [query, setQuery] = useState('')
  const [signatures, setSignatures] = useState('')
  const [queryCount, setQueryCount] = useState(0)
  const [secondsUntilReset, setSecondsUntilReset] = useState(RESET_INTERVAL)
  const resolvedTheme = useResolvedTheme()

  useEffect(() => {
    if (queryCount === 0) return

    const interval = setInterval(() => {
      setSecondsUntilReset((prev) => {
        if (prev <= 1) {
          setQueryCount(0)
          return RESET_INTERVAL
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [queryCount])

  const { mutate, data, error, isPending } = useMutation({
    mutationFn: (params: FetchParams) => is.fetch(params),
  })

  const isRateLimited = queryCount >= RATE_LIMIT

  function executeQuery(cursor?: string) {
    if (isRateLimited) return

    const sigList = signatures
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    setQueryCount((prev) => prev + 1)
    mutate({
      query,
      signatures: sigList.length > 0 ? (sigList as IndexSupply.Signature[]) : undefined,
      cursor,
    })
  }

  const result = error
    ? JSON.stringify({ error: String(error) }, jsonReplacer, 2)
    : data
      ? JSON.stringify(data, jsonReplacer, 2)
      : ''

  return (
    <div className="flex flex-col gap-6 px-6 py-2">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Query</h1>
        <p className="text-sm text-muted-foreground">
          Use SQL to fetch onchain data. Powered by{' '}
          <a
            href="https://indexsupply.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline underline-offset-2"
          >
            IndexSupply
          </a>
          .
        </p>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <QueryEditor value={query} onChange={setQuery} isDark={resolvedTheme === 'dark'} />
        <SignaturesInput value={signatures} onChange={setSignatures} />

        <div className="flex flex-row gap-2 items-center">
          <Button
            onClick={() => executeQuery()}
            className="rounded-none hover:cursor-pointer"
            disabled={isPending || !query.trim() || isRateLimited}
          >
            {isPending ? 'Executing...' : 'Execute Query'}
          </Button>
          {data?.cursor && (
            <Button
              variant="outline"
              className="rounded-none hover:cursor-pointer"
              onClick={() => executeQuery(data.cursor)}
              disabled={isPending || isRateLimited}
            >
              Next Page
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-none hover:cursor-pointer"
            onClick={() => { setQuery(''); setSignatures('') }}
          >
            Clear
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {queryCount}/{RATE_LIMIT} queries • resets in {secondsUntilReset}s
          </span>
        </div>

        <QueryResult value={result} />
      </div>
    </div>
  )
}
