import { cn } from "@/lib/utils";

type LabelType = "info" | "warning" | "error";

interface ErrorMessageProps {
  text: string;
  type?: LabelType;
  className?: string;
}

const styles: Record<LabelType, string> = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
};

const labels: Record<LabelType, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

export function ErrorMessage({ text, type = "error", className }: ErrorMessageProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        styles[type],
        className
      )}
    >
      <span className="font-semibold">{labels[type]}:</span>
      <span>{text}</span>
    </div>
  );
}
