import { Textarea } from '@/components/ui/textarea'

type Props = {
  value: string
  onChange: (value: string) => void
}

export function SignaturesInput({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-muted-foreground">
        Signatures <span className="text-xs">(optional, one per line)</span>
      </label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="event Transfer(address indexed from, address indexed to, uint256 value)"
        className="h-[100px] resize-none overflow-auto rounded-none font-mono text-sm"
      />
    </div>
  )
}
