import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";

function serializeTx(tx: object): string {
  return JSON.stringify(
    tx,
    (_key, value) => (typeof value === "bigint" ? `0x${value.toString(16)}` : value),
    2
  );
}

export function TransactionObject({
  tx,
  isLoading,
  isError,
}: {
  tx?: object | null;
  isLoading?: boolean;
  isError?: boolean;
}) {
  return (
    <div className="border border-accent mt-2">
      <div className="flex flex-row justify-between items-center bg-accent text-accent-foreground p-1">
        <span className="text-sm font-bold">Transaction Object</span>
        {tx && <CopyButton text={serializeTx(tx)} />}
      </div>
      <div className="p-2">
        {isLoading ? (
          <Skeleton className="w-full h-24" />
        ) : isError ? (
          <p className="text-red-400 text-xs">Failed to prepare transaction</p>
        ) : tx ? (
          <Textarea
            readOnly
            className="rounded-none text-xs font-mono resize-none border-none focus-visible:ring-0 p-0 min-h-48"
            value={serializeTx(tx)}
          />
        ) : (
          <p className="text-muted-foreground text-xs">Fill in recipient and amount to prepare</p>
        )}
      </div>
    </div>
  );
}
