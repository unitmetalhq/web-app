import { atom } from "jotai";

/**
 * Shared ERC-20 balance map written by BalancesComponent and consumed by
 * TokenPickerDialog for sorting. Keys are lowercase token addresses.
 */
export const tokenBalancesAtom = atom<Map<string, bigint>>(new Map());
