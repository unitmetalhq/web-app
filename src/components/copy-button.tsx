import { useState } from "react";
import { Copy, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-6 w-6 hover:cursor-pointer"
      onClick={handleCopy}
    >
      {copied ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}
