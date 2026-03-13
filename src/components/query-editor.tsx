import { lazy, Suspense } from 'react'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { githubLight, githubDark } from '@uiw/codemirror-theme-github'
import { Button } from '@/components/ui/button'
import { format } from 'sql-formatter'

const CodeMirror = lazy(() => import('@uiw/react-codemirror'))

type Props = {
  value: string
  onChange: (value: string) => void
  isDark: boolean
}

export function QueryEditor({ value, onChange, isDark }: Props) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-row justify-between items-center">
        <label className="text-sm font-medium text-muted-foreground">Editor</label>
        <Button
          variant="outline"
          className="rounded-none hover:cursor-pointer"
          onClick={() => onChange(format(value, { language: 'sql' }))}
          disabled={!value.trim()}
        >
          Format
        </Button>
      </div>
      <Suspense fallback={<div className="h-[400px] w-full bg-muted/50 animate-pulse border" />}>
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={[sql(), EditorView.lineWrapping]}
          theme={isDark ? githubDark : githubLight}
          placeholder="Enter your SQL query here..."
          height="400px"
          className="rounded-none"
        />
      </Suspense>
    </div>
  )
}
