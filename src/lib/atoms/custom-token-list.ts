import { atomWithStorage } from "jotai/utils";

export type CustomToken = {
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
};

export const customTokensAtom = atomWithStorage<CustomToken[]>("custom-token-list", []);
