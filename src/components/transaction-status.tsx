import { Loader2, Check, ExternalLink } from "lucide-react";
import { truncateHash } from "@/lib/utils";
import type { Hash } from "viem";

export function TransactionStatus({
  isPending,
  isConfirming,
  isConfirmed,
  txHash,
  blockExplorerUrl,
}: {
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  txHash: Hash | undefined;
  blockExplorerUrl: string | undefined;
}) {
  return (
    <div className="border-t-2 border-primary pt-4 mt-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-row gap-2 items-center">
          {isPending ? (
            <div className="flex flex-row gap-2 items-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p>Signing transaction...</p>
            </div>
          ) : isConfirming ? (
            <div className="flex flex-row gap-2 items-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p>Confirming transaction...</p>
            </div>
          ) : isConfirmed ? (
            <div className="flex flex-row gap-2 items-center">
              <Check className="w-4 h-4" />
              <p>Transaction confirmed</p>
            </div>
          ) : (
            <div className="flex flex-row gap-2 items-center">
              <p className="text-muted-foreground">&gt;</p>
              <p>No pending transaction</p>
            </div>
          )}
        </div>
        {txHash ? (
          <div className="flex flex-row gap-2 items-center">
            <p className="text-muted-foreground">&gt;</p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:cursor-pointer"
              href={blockExplorerUrl ? `${blockExplorerUrl}/tx/${txHash}` : undefined}
            >
              <div className="flex flex-row gap-2 items-center">
                {truncateHash(txHash)}
                <ExternalLink className="w-4 h-4" />
              </div>
            </a>
          </div>
        ) : (
          <div className="flex flex-row gap-2 items-center">
            <p className="text-muted-foreground">&gt;</p>
            <p>No transaction hash</p>
          </div>
        )}
      </div>
    </div>
  );
}
