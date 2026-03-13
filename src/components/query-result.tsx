import { Textarea } from '@/components/ui/textarea'

type Props = {
  value: string
}

export function QueryResult({ value }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">Result</label>
      <Textarea
        value={value}
        readOnly
        placeholder="Query results will appear here..."
        className="h-[400px] resize-none overflow-auto rounded-none bg-muted/50 font-mono text-sm"
      />
    </div>
  )
}
