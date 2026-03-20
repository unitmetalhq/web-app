import { parseEther, type Address } from "viem";
import type { ParsedRecipient, ParseError, ParseResult } from "@/types/send-batch";

export type { ParsedRecipient, ParseError, ParseResult };
export type { BatchEditorProps } from "@/types/send-batch";

// ── parseRecipients ───────────────────────────────────────────────────────────

export function parseRecipients(text: string): ParseResult {
  const valid: ParsedRecipient[] = [];
  const errors: ParseError[] = [];

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) {
      errors.push({ line: i + 1, text: line, reason: "Expected address,amount" });
      return;
    }

    const address = line.slice(0, commaIdx).trim();
    const amount = line.slice(commaIdx + 1).trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      errors.push({ line: i + 1, text: line, reason: "Invalid address" });
      return;
    }

    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) {
      errors.push({ line: i + 1, text: line, reason: "Invalid amount" });
      return;
    }

    try {
      parseEther(amount);
    } catch {
      errors.push({ line: i + 1, text: line, reason: "Invalid amount format" });
      return;
    }

    valid.push({ address: address as Address, amount });
  });

  return { valid, errors };
}
