import { useConnection } from "wagmi";

// Returns true when the active connector is the impersonator (read-only mode).
// Use this to conditionally disable send/swap/approve buttons across the app.
export function useIsViewOnly(): boolean {
  const { connector } = useConnection();
  return connector?.id === "impersonator";
}
