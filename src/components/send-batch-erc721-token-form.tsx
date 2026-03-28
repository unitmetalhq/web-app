import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Wallet, Sigma, Eraser, Upload, FileText, X } from "lucide-react";
import { erc721Abi, isAddress, type Address } from "viem";
import {
  useBalance,
  useConnection,
  useCapabilities,
  useConfig,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSimulateContract,
} from "wagmi";
import { BATCH_DISTRIBUTOR_CONTRACT_ADDRESS, BATCH_DISTRIBUTOR_FEE } from "@/lib/constants";
import { BatchDistributorAbi } from "@/lib/abis/batch-distributor-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatEther } from "viem";
import type { ParseError } from "@/lib/send-batch-utils";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

// ── Parser ────────────────────────────────────────────────────────────────────

type NftRecipient = { address: Address; tokenId: bigint };
type NftParseResult = { valid: NftRecipient[]; errors: ParseError[] };

function parseNftRecipients(text: string): NftParseResult {
  const valid: NftRecipient[] = [];
  const errors: ParseError[] = [];

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) {
      errors.push({ line: i + 1, text: line, reason: "Expected address,tokenId" });
      return;
    }

    const address = line.slice(0, commaIdx).trim();
    const tokenIdStr = line.slice(commaIdx + 1).trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      errors.push({ line: i + 1, text: line, reason: "Invalid address" });
      return;
    }

    if (!tokenIdStr || !/^\d+$/.test(tokenIdStr)) {
      errors.push({ line: i + 1, text: line, reason: "Token ID must be a non-negative integer" });
      return;
    }

    try {
      valid.push({ address: address as Address, tokenId: BigInt(tokenIdStr) });
    } catch {
      errors.push({ line: i + 1, text: line, reason: "Invalid token ID" });
    }
  });

  return { valid, errors };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Erc721EditorProps = {
  tokenAddress: Address;
  tokenSymbol: string;
  isApprovedForAll: boolean;
  nativeBalance: bigint | undefined;
  atomicBatchSupported: boolean;
  selectedChain: number | null;
};

// ── Erc721TextEditor ──────────────────────────────────────────────────────────

function Erc721TextEditor({
  tokenAddress,
  tokenSymbol,
  isApprovedForAll,
  nativeBalance,
  atomicBatchSupported,
  selectedChain,
}: Erc721EditorProps) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const distributeWrite = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: distributeWrite.data });

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const parsed = useMemo(() => parseNftRecipients(text), [text]);

  const isOverNativeBalance = nativeBalance !== undefined && BATCH_DISTRIBUTOR_FEE > nativeBalance;
  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverNativeBalance && isApprovedForAll;

  const simulatedAddresses = parsed.valid.map((r) => r.address);
  const simulatedTokenIds = parsed.valid.map((r) => r.tokenId);

  const { data: simulatedTx, isLoading: isLoadingSimulate, isError: isErrorSimulate } = useSimulateContract({
    address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
    abi: BatchDistributorAbi,
    functionName: "distributeNft",
    args: [tokenAddress, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedTokenIds[i] })) }],
    value: BATCH_DISTRIBUTOR_FEE,
    query: { enabled: showTxObject && simulatedAddresses.length > 0 && isApprovedForAll },
  });

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const tokenIds = parsed.valid.map((r) => r.tokenId);
      if (atomicBatchSupported) {
        // EIP-5792 — TBD
      } else {
        await distributeWrite.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeNft",
          args: [tokenAddress, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: tokenIds[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  const isPending = distributeWrite.isPending || isConfirming;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* fee balance row */}
      <div className="flex flex-row gap-2 items-center justify-end text-sm">
        <Wallet className="w-4 h-4 text-muted-foreground" />
        <span className={isOverNativeBalance ? "text-red-400" : ""}>
          {nativeBalance !== undefined ? formatEther(nativeBalance) : "—"} ETH
        </span>
      </div>

      {/* recipient count */}
      <div className="flex flex-row gap-2 items-center justify-end text-sm">
        <Sigma className="w-4 h-4 text-muted-foreground" />
        <span>{parsed.valid.length} NFT{parsed.valid.length !== 1 ? "s" : ""}</span>
      </div>

      {/* editor */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          One recipient per line: <code>address,tokenId</code>. Lines starting with <code>#</code> are ignored.
        </label>
        <Suspense fallback={<div className="h-48 w-full bg-muted/50 animate-pulse border" />}>
          <CodeMirror
            value={text}
            onChange={setText}
            extensions={[EditorView.lineWrapping]}
            theme={isDark ? githubDark : githubLight}
            placeholder={"0xRecipient1,42\n0xRecipient2,137\n# comment"}
            height="200px"
            className="rounded-none text-xs"
          />
        </Suspense>
      </div>

      {/* parse status */}
      {text.trim() && (
        <div className="flex flex-col gap-1 text-xs">
          {parsed.valid.length > 0 && (
            <span className="text-green-500">{parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}</span>
          )}
          {parsed.errors.map((e) => (
            <span key={e.line} className="text-red-400">Line {e.line}: {e.reason} — <code>{e.text}</code></span>
          ))}
          {isOverNativeBalance && <span className="text-red-400">Insufficient ETH for fee (0.001 ETH required)</span>}
          {!isApprovedForAll && parsed.valid.length > 0 && (
            <span className="text-yellow-500">Approve the contract above before sending</span>
          )}
        </div>
      )}

      {/* actions */}
      <div className="grid grid-cols-5 gap-2">
        <Button type="button" variant="outline" size="icon" className="rounded-none hover:cursor-pointer col-span-1" onClick={() => setText("")}>
          <Eraser className="w-4 h-4" />
        </Button>
        <Button type="button" variant="outline" className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || isPending}
          onClick={() => setShowTxObject((prev) => !prev)}
        >
          Request
        </Button>
        <Button type="button" className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || isPending}
          onClick={handleSubmit}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
        </Button>
      </div>

      {showTxObject && <TransactionObject transactionObject={simulatedTx?.request ?? null} isLoading={isLoadingSimulate} isError={isErrorSimulate} />}
      {submitError && <Alert variant="destructive"><AlertCircle /><AlertTitle>Error</AlertTitle><AlertDescription>{submitError}</AlertDescription></Alert>}
      <TransactionStatus isPending={distributeWrite.isPending} isConfirming={isConfirming} isConfirmed={isConfirmed} txHash={distributeWrite.data} blockExplorerUrl={blockExplorerUrl} />
    </div>
  );
}

// ── Erc721FileUpload ──────────────────────────────────────────────────────────

function Erc721FileUpload({
  tokenAddress,
  tokenSymbol,
  isApprovedForAll,
  nativeBalance,
  atomicBatchSupported,
  selectedChain,
}: Erc721EditorProps) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const distributeWrite = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: distributeWrite.data });

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (fileText !== null ? parseNftRecipients(fileText) : null), [fileText]);

  const isOverNativeBalance = nativeBalance !== undefined && BATCH_DISTRIBUTOR_FEE > nativeBalance;
  const canSubmit = (parsed?.valid.length ?? 0) > 0 && (parsed?.errors.length ?? 1) === 0 && !isOverNativeBalance && isApprovedForAll;

  const simulatedAddresses = (parsed?.valid ?? []).map((r) => r.address);
  const simulatedTokenIds = (parsed?.valid ?? []).map((r) => r.tokenId);

  const { data: simulatedTx, isLoading: isLoadingSimulate, isError: isErrorSimulate } = useSimulateContract({
    address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
    abi: BatchDistributorAbi,
    functionName: "distributeNft",
    args: [tokenAddress, { txns: simulatedAddresses.map((addr, i) => ({ recipient: addr, amount: simulatedTokenIds[i] })) }],
    value: BATCH_DISTRIBUTOR_FEE,
    query: { enabled: showTxObject && simulatedAddresses.length > 0 && isApprovedForAll },
  });

  function loadFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") { setFileName(file.name); setFileText(""); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setFileText((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleClear() {
    setFileName(null); setFileText(null); setSubmitError(null); setShowTxObject(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const tokenIds = parsed.valid.map((r) => r.tokenId);
      if (atomicBatchSupported) {
        // EIP-5792 — TBD
      } else {
        await distributeWrite.mutateAsync({
          address: BATCH_DISTRIBUTOR_CONTRACT_ADDRESS,
          abi: BatchDistributorAbi,
          functionName: "distributeNft",
          args: [tokenAddress, { txns: addresses.map((addr, i) => ({ recipient: addr, amount: tokenIds[i] })) }],
          value: BATCH_DISTRIBUTOR_FEE,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  const SAMPLE_CSV = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,42\n0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,137`;
  const isPending = distributeWrite.isPending || isConfirming;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* fee balance row */}
      <div className="flex flex-row gap-2 items-center justify-end text-sm">
        <Wallet className="w-4 h-4 text-muted-foreground" />
        <span className={isOverNativeBalance ? "text-red-400" : ""}>
          {nativeBalance !== undefined ? formatEther(nativeBalance) : "—"} ETH
        </span>
      </div>

      {/* sample format */}
      <div className="flex flex-col gap-1 border p-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Sample CSV format
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">No header row. One recipient per line: <code>address,tokenId</code></p>
        <pre className="text-xs bg-muted/50 p-2 mt-1 overflow-x-auto leading-5">{SAMPLE_CSV}</pre>
        <button type="button" className="text-xs text-primary underline underline-offset-2 self-start mt-1 hover:cursor-pointer"
          onClick={() => {
            const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "nft-recipients-sample.csv"; a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download sample
        </button>
      </div>

      {/* drop zone */}
      {fileText === null ? (
        <div
          role="button" tabIndex={0}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:cursor-pointer hover:border-primary hover:text-foreground ${isDragging ? "border-primary text-foreground bg-muted/30" : ""}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) loadFile(file); }}
        >
          <Upload className="w-6 h-6" />
          <span>Drop a CSV file here or click to browse</span>
          <span className="text-xs">Accepts .csv files only</span>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 border p-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{fileName}</span>
            <Button type="button" variant="ghost" size="icon" className="rounded-none h-6 w-6 shrink-0 hover:cursor-pointer" onClick={handleClear}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          {parsed && (
            <div className="flex flex-col gap-1 text-xs">
              {parsed.valid.length > 0 && <span className="text-green-500">{parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}</span>}
              {parsed.errors.length > 0 && (
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {parsed.errors.map((e) => <span key={e.line} className="text-red-400">Line {e.line}: {e.reason} — <code>{e.text}</code></span>)}
                </div>
              )}
              {parsed.valid.length === 0 && parsed.errors.length === 0 && <span className="text-muted-foreground">No recipients found in file</span>}
              {isOverNativeBalance && <span className="text-red-400">Insufficient ETH for fee (0.001 ETH required)</span>}
              {!isApprovedForAll && parsed.valid.length > 0 && (
                <span className="text-yellow-500">Approve the contract above before sending</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* actions */}
      <div className="grid grid-cols-5 gap-2">
        <Button type="button" variant="outline" size="icon" className="rounded-none hover:cursor-pointer col-span-1" onClick={handleClear} disabled={fileText === null}>
          <Eraser className="w-4 h-4" />
        </Button>
        <Button type="button" variant="outline" className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || isPending}
          onClick={() => setShowTxObject((prev) => !prev)}
        >
          Request
        </Button>
        <Button type="button" className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || isPending}
          onClick={handleSubmit}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send batch"}
        </Button>
      </div>

      {showTxObject && <TransactionObject transactionObject={simulatedTx?.request ?? null} isLoading={isLoadingSimulate} isError={isErrorSimulate} />}
      {submitError && <Alert variant="destructive"><AlertCircle /><AlertTitle>Error</AlertTitle><AlertDescription>{submitError}</AlertDescription></Alert>}
      <TransactionStatus isPending={distributeWrite.isPending} isConfirming={isConfirming} isConfirmed={isConfirmed} txHash={distributeWrite.data} blockExplorerUrl={blockExplorerUrl} />
    </div>
  );
}

// ── SendBatchErc721TokenForm ──────────────────────────────────────────────────

export default function SendBatchErc721TokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  const connection = useConnection();
  const isConnected = !!connection.chain && !!connection.address;

  const { data: capabilities, isLoading: isLoadingCapabilities } = useCapabilities({ query: { enabled: isConnected } });
  const atomicBatch = connection.chain?.id ? capabilities?.[connection.chain.id]?.atomicBatch : undefined;

  const { data: nativeBalanceData, refetch: refetchNativeBalance } = useBalance({
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
    query: { enabled: isConnected },
  });

  useEffect(() => { refetchNativeBalance(); }, [selectedChain, refetchNativeBalance]);

  const [tokenInput, setTokenInput] = useState("");
  const tokenAddress = isAddress(tokenInput) ? (tokenInput as Address) : null;

  // Read contract name + symbol
  const { data: contractData, isLoading: isLoadingContract } = useReadContracts({
    contracts: tokenAddress ? [
      { address: tokenAddress, abi: erc721Abi, functionName: "name" as const },
      { address: tokenAddress, abi: erc721Abi, functionName: "symbol" as const },
    ] : [],
    query: { enabled: !!tokenAddress },
  });

  const contractName = contractData?.[0]?.status === "success" ? (contractData[0].result as string) : undefined;
  const contractSymbol = contractData?.[1]?.status === "success" ? (contractData[1].result as string) : undefined;
  const isContractLoaded = !!contractName && !!contractSymbol;

  // isApprovedForAll
  const {
    data: approvedForAll,
    isLoading: isLoadingApproval,
    refetch: refetchApproval,
  } = useReadContract({
    address: tokenAddress ?? undefined,
    abi: erc721Abi,
    functionName: "isApprovedForAll",
    args: [connection.address!, BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address],
    query: { enabled: !!tokenAddress && !!connection.address },
  });

  const isApprovedForAll = approvedForAll === true;

  // setApprovalForAll
  const approveWrite = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveWrite.data });

  useEffect(() => {
    if (isApproveConfirmed) void refetchApproval();
  }, [isApproveConfirmed, refetchApproval]);

  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const editorProps: Erc721EditorProps | null = isContractLoaded && tokenAddress && contractSymbol ? {
    tokenAddress,
    tokenSymbol: contractSymbol,
    isApprovedForAll,
    nativeBalance: nativeBalanceData?.value,
    atomicBatchSupported: !!atomicBatch?.supported,
    selectedChain,
  } : null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h2 className="text-md font-bold">NFT Contract</h2>

      {/* contract address input */}
      <div className="flex flex-col gap-1">
        <Input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="ERC721 contract address (0x...)"
          className="rounded-none h-8 text-xs font-mono"
        />
        {tokenInput && !tokenAddress && <span className="text-xs text-red-400">Invalid address</span>}
        {tokenAddress && isLoadingContract && <Skeleton className="w-32 h-4" />}
        {tokenAddress && !isLoadingContract && contractName && (
          <span className="text-xs text-green-500">{contractName} ({contractSymbol})</span>
        )}
        {tokenAddress && !isLoadingContract && !contractName && (
          <span className="text-xs text-red-400">Contract not found</span>
        )}
      </div>

      {/* capabilities badge */}
      {isLoadingCapabilities ? (
        <Skeleton className="w-24 h-5" />
      ) : (
        <Badge variant="outline">
          <span className={`size-2 rounded-full ${atomicBatch?.supported ? "bg-green-500" : "bg-red-400"}`} />
          Atomic batch
        </Badge>
      )}

      {/* approval section — shown once contract is loaded */}
      {isContractLoaded && tokenAddress && (
        <div className="flex flex-col gap-2 border p-3">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">Contract approval</span>
              <span className="text-xs text-muted-foreground">
                Allow BatchDistributor to transfer your {contractSymbol} tokens
              </span>
            </div>
            {isLoadingApproval ? (
              <Skeleton className="w-16 h-6" />
            ) : isApprovedForAll ? (
              <Badge variant="outline" className="text-green-500 border-green-500">Approved</Badge>
            ) : (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">Not approved</Badge>
            )}
          </div>

          {!isApprovedForAll && (
            <Button
              type="button"
              variant="outline"
              className="rounded-none w-full hover:cursor-pointer"
              disabled={approveWrite.isPending || isApproveConfirming}
              onClick={async () => {
                try {
                  await approveWrite.mutateAsync({
                    address: tokenAddress,
                    abi: erc721Abi,
                    functionName: "setApprovalForAll",
                    args: [BATCH_DISTRIBUTOR_CONTRACT_ADDRESS as Address, true],
                  });
                } catch { }
              }}
            >
              {approveWrite.isPending || isApproveConfirming
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : `Approve all ${contractSymbol}`
              }
            </Button>
          )}

          {(approveWrite.data || approveWrite.isPending || isApproveConfirming) && (
            <TransactionStatus
              isPending={approveWrite.isPending}
              isConfirming={isApproveConfirming}
              isConfirmed={isApproveConfirmed}
              txHash={approveWrite.data}
              blockExplorerUrl={blockExplorerUrl}
            />
          )}
        </div>
      )}

      {/* editors — only shown once contract is loaded */}
      {editorProps && (
        <Tabs defaultValue="text-editor" className="w-full">
          <TabsList className="border-primary border rounded-none">
            <TabsTrigger className="rounded-none" value="text-editor">Text</TabsTrigger>
            <TabsTrigger className="rounded-none" value="file-upload">File</TabsTrigger>
          </TabsList>
          <TabsContent value="text-editor">
            <Erc721TextEditor {...editorProps} />
          </TabsContent>
          <TabsContent value="file-upload">
            <Erc721FileUpload {...editorProps} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
