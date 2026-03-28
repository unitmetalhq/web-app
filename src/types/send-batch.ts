import type { Address } from "viem";

export type ParsedRecipient = { address: Address; amount: string };
export type ParseError = { line: number; text: string; reason: string };
export type ParseResult = { valid: ParsedRecipient[]; errors: ParseError[] };

export type BatchTokenProps = {
  address: Address;
  symbol: string;
  decimals: number;
  balance: bigint | undefined;
  isLoading: boolean;
};

export type BatchEditorProps = {
  nativeBalance: { value: bigint; symbol: string; decimals: number } | undefined;
  isLoadingNativeBalance: boolean;
  atomicBatchSupported: boolean;
  selectedChain: number | null;
  token?: BatchTokenProps;
};
