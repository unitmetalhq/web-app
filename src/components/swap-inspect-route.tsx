import { ScanEye } from "lucide-react";
import { formatUnits } from "viem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { type SwapRoute } from "@/atoms/swap-route";

export function SwapInspectRouteDialog({
  route,
  tokenOutDecimals,
}: {
  route: SwapRoute;
  tokenOutDecimals: number;
}) {
  const formattedAmountOut = formatUnits(BigInt(route.amountOut), tokenOutDecimals);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground hover:cursor-pointer p-0.5"
            aria-label={`Inspect ${route.aggregator} route`}
          />
        }
      >
        <ScanEye className="w-3 h-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ScanEye className="w-4 h-4 shrink-0" />
            <DialogTitle>Inspect {route.aggregator} route</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <InspectField label="Aggregator" value={route.aggregator} />
          <InspectField
            label="Amount out (raw)"
            value={route.amountOut}
            mono
          />
          <InspectField
            label="Amount out (formatted)"
            value={formattedAmountOut}
            mono
          />
          <InspectField
            label="Approval target"
            value={route.approvalTarget}
            mono
          />
          <InspectField label="Tx to" value={route.tx.to} mono />
          <InspectField label="Tx value (wei)" value={route.tx.value} mono />
          <InspectField label="Tx data" value={route.tx.data} mono multiline />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InspectField({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <CopyButton text={value} />
      </div>
      <p
        className={`border border-border p-1.5 ${mono ? "font-mono" : ""} ${
          multiline ? "max-h-32 overflow-y-auto break-all" : "truncate"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
