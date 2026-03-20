import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { serializeTransactionObject } from "@/lib/utils";


export function TransactionObject({
  transactionObject,
  isLoading,
  isError,
}: {
  transactionObject?: object | null;
  isLoading?: boolean;
  isError?: boolean;
}) {
  return (
    <div className="border border-accent mt-2">
      <div className="flex flex-row justify-between items-center bg-accent text-accent-foreground p-1">
        <span className="text-sm font-bold">Transaction Object</span>
        {transactionObject && <CopyButton text={serializeTransactionObject(transactionObject)} />}
      </div>
      <div className="p-2">
        {isLoading ? (
          <Skeleton className="w-full h-24" />
        ) : isError ? (
          <p className="text-red-400 text-xs">Failed to prepare transaction</p>
        ) : transactionObject ? (
          <Textarea
            readOnly
            className="rounded-none text-xs font-mono resize-none border-none focus-visible:ring-0 p-0 min-h-48"
            value={serializeTransactionObject(transactionObject)}
          />
        ) : (
          <p className="text-muted-foreground text-xs">Fill in recipient and amount to prepare</p>
        )}
      </div>
    </div>
  );
}
