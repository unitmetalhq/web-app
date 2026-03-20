import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "@/components/theme-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm, useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Loader2, Search, Plus, X, Wallet, Sigma, Eraser, Upload, FileText } from "lucide-react";
import { parseEther, formatEther, type Address } from "viem";
import { useBalance, useEnsAddress, useConnection, useCapabilities, useWriteContract, useWaitForTransactionReceipt, useConfig, useSimulateContract } from "wagmi";
import { GASLITEDROP_CONTRACT_ADDRESS } from "@/lib/constants";
import { GasliteDropAbi } from "@/lib/abis/gaslite-drop-abi";
import { TransactionStatus } from "@/components/transaction-status";
import { TransactionObject } from "@/components/transaction-object";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { normalize } from "viem/ens";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

export default function SendBatchNativeTokenForm({
  selectedChain,
}: {
  selectedChain: number | null;
}) {
  const connection = useConnection();

  const isBalanceQueryEnabled = !!connection.chain && !!connection.address;

  // check wallet capabilities (EIP-5792)
  const {
    data: capabilities,
    isLoading: isLoadingCapabilities,
  } = useCapabilities({
    query: { enabled: isBalanceQueryEnabled },
  });

  // atomicBatch capability on the connected chain
  const atomicBatch = connection.chain?.id
    ? capabilities?.[connection.chain.id]?.atomicBatch
    : undefined;

  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNativeBalance,
  } = useBalance({
    query: { enabled: isBalanceQueryEnabled },
    address: connection.address || undefined,
    chainId: connection.chain?.id || undefined,
  });

  useEffect(() => {
    refetchNativeBalance();
  }, [selectedChain, refetchNativeBalance]);

  return (
    <div className="flex flex-col gap-2 mt-2">
      <h2 className="text-md font-bold">Input mode</h2>
      {isLoadingCapabilities ? (
        <Skeleton className="w-24 h-5" />
      ) : (
        <Badge variant="outline">
          <span className={`size-2 rounded-full ${atomicBatch?.supported ? "bg-green-500" : "bg-red-400"}`} />
          Atomic batch
        </Badge>
      )}
      <Tabs defaultValue="simple-editor" className="w-full">
        <TabsList className="border-primary border rounded-none">
          <TabsTrigger className="rounded-none" value="simple-editor">
            Simple
          </TabsTrigger>
          <TabsTrigger className="rounded-none" value="text-editor">
            Text
          </TabsTrigger>
          <TabsTrigger className="rounded-none" value="file-upload">
            File
          </TabsTrigger>
        </TabsList>
        <TabsContent value="simple-editor">
          <SimpleEditor
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
        <TabsContent value="text-editor">
          <TextEditor
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
        <TabsContent value="file-upload">
          <FileUpload
            nativeBalance={nativeBalance}
            isLoadingNativeBalance={isLoadingNativeBalance}
            atomicBatchSupported={!!atomicBatch?.supported}
            selectedChain={selectedChain}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── RecipientRow ──────────────────────────────────────────────────────────────

function RecipientRow({
  addressField,
  amountField,
  isOnly,
  onRemove,
}: {
  addressField: AnyFieldApi;
  amountField: AnyFieldApi;
  isOnly: boolean;
  onRemove: () => void;
}) {
  const address = addressField.state.value as string;

  const {
    data: ensAddress,
    isLoading: isLoadingEns,
    isError: isErrorEns,
    refetch: refetchEns,
  } = useEnsAddress({
    chainId: 1,
    name:
      address && address.endsWith(".eth") && address.split(".")[0] !== ""
        ? normalize(address)
        : undefined,
    query: { enabled: false },
  });

  useEffect(() => {
    if (ensAddress) {
      addressField.handleChange(ensAddress);
    }
  }, [ensAddress, addressField]);

  return (
    <div className="grid grid-cols-[1fr_2rem] md:grid-cols-[1fr_9rem_2rem] gap-1 items-start py-3 md:py-0">
      {/* address + status */}
      <div className="col-span-2 md:col-span-1 flex flex-col gap-0.5">
        <InputGroup>
          <InputGroupInput
            value={addressField.state.value}
            onChange={(e) => addressField.handleChange(e.target.value)}
            placeholder="0x... or ENS"
            className="rounded-none h-8 text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="ENS lookup"
              size="icon-xs"
              onClick={() => refetchEns()}
              className="hover:cursor-pointer"
            >
              {isLoadingEns ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <AddressRowStatus
          field={addressField}
          ensAddress={ensAddress}
          isLoadingEns={isLoadingEns}
          isErrorEns={isErrorEns}
        />
      </div>

      {/* amount + status */}
      <div className="flex flex-col gap-0.5">
        <Input
          value={amountField.state.value}
          onChange={(e) => amountField.handleChange(e.target.value)}
          placeholder="0.0"
          type="number"
          inputMode="decimal"
          className="rounded-none h-8 text-xs"
        />
        <AmountRowStatus field={amountField} />
      </div>

      {/* remove */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-none h-8 w-8 hover:cursor-pointer"
        disabled={isOnly}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

// ── SimpleEditor ──────────────────────────────────────────────────────────────

function SimpleEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
}: {
  nativeBalance: { value: bigint; symbol: string; decimals: number } | undefined;
  isLoadingNativeBalance: boolean;
  atomicBatchSupported: boolean;
  selectedChain: number | null;
}) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const form = useForm({
    defaultValues: {
      recipients: [{ address: "", amount: "" }],
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const addresses = value.recipients.map((r) => r.address as Address);
        const amounts = value.recipients.map((r) => parseEther(r.amount));
        const total = amounts.reduce((a, b) => a + b, BigInt(0));

        if (atomicBatchSupported) {
          // EIP-5792 wallet_sendCalls — TBD
        } else {
          await writeContract.mutateAsync({
            address: GASLITEDROP_CONTRACT_ADDRESS,
            abi: GasliteDropAbi,
            functionName: "airdropETH",
            args: [addresses, amounts],
            value: total,
          });
        }
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Transaction failed");
      }
    },
  });

  const [uniformAmount, setUniformAmount] = useState(false);

  const recipients = useStore(form.store, (state) => state.values.recipients);

  // when uniform amount is on, sync all rows to the first row's amount
  useEffect(() => {
    if (!uniformAmount) return;
    const first = recipients[0]?.amount ?? "";
    recipients.forEach((r, i) => {
      if (i > 0 && r.amount !== first) {
        form.setFieldValue(`recipients[${i}].amount`, first);
      }
    });
  }, [uniformAmount, recipients, form]);

  let totalAmount = BigInt(0);
  for (const r of recipients) {
    try {
      if (r.amount) totalAmount += parseEther(r.amount);
    } catch {
      // ignore parse errors while typing
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";

  const simulatedAddresses = recipients.map((r) => r.address as Address);
  const simulatedAmounts = recipients.map((r) => { try { return parseEther(r.amount); } catch { return BigInt(0); } });

  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract({
    address: GASLITEDROP_CONTRACT_ADDRESS,
    abi: GasliteDropAbi,
    functionName: "airdropETH",
    args: [simulatedAddresses, simulatedAmounts],
    value: totalAmount,
    query: { enabled: showTxObject && simulatedAddresses.every((a) => !!a) && totalAmount > BigInt(0) },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-3 mt-2">
        {/* balance + running total */}
        <div className="flex flex-col gap-1 text-sm items-end">
          <div className="flex flex-row gap-2 items-center">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            {isLoadingNativeBalance ? (
              <Skeleton className="w-24 h-4" />
            ) : (
              <span>
                {formatEther(nativeBalance?.value ?? BigInt(0))} {symbol}
              </span>
            )}
          </div>
          <div className="flex flex-row gap-2 items-center">
            <Sigma className="w-4 h-4 text-muted-foreground" />
            <span className={isOverBalance ? "text-red-400" : ""}>
              {formatEther(totalAmount)} {symbol}
            </span>
          </div>
        </div>

        {/* uniform amount toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="uniform-amount"
            checked={uniformAmount}
            onCheckedChange={setUniformAmount}
            className="rounded-none **:data-[slot=switch-thumb]:rounded-none"
          />
          <Label htmlFor="uniform-amount" className="text-xs cursor-pointer">
            Same amount for all
          </Label>
        </div>

        {/* column headers */}
        <div className="hidden md:grid grid-cols-[1fr_9rem_2rem] gap-1 text-xs text-muted-foreground px-1">
          <span>Address</span>
          <span>Amount ({symbol})</span>
          <span />
        </div>

        {/* rows */}
        <form.Field name="recipients" mode="array">
          {(field) => (
            <div className="flex flex-col divide-y divide-border md:divide-y-0 gap-0 md:gap-2">
              {field.state.value.map((_, i) => (
                <form.Field
                  key={i}
                  name={`recipients[${i}].address`}
                  validators={{
                    onChange: ({ value }: { value?: string }) =>
                      !value ? "Please enter an address or ENS" : undefined,
                  }}
                >
                  {(addressField: AnyFieldApi) => (
                    <form.Field
                      name={`recipients[${i}].amount`}
                      validators={{
                        onChange: ({ value }: { value?: string }) => {
                          if (!value) return "Please enter an amount";
                          const n = parseFloat(value);
                          if (isNaN(n)) return "Invalid number";
                          if (n <= 0) return "Must be > 0";
                          try {
                            parseEther(value);
                          } catch {
                            return "Invalid format";
                          }
                          return undefined;
                        },
                      }}
                    >
                      {(amountField: AnyFieldApi) => (
                        <RecipientRow
                          addressField={addressField}
                          amountField={amountField}
                          isOnly={field.state.value.length === 1}
                          onRemove={() => field.removeValue(i)}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Field>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none hover:cursor-pointer w-full"
                onClick={() => field.pushValue({ address: "", amount: "" })}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add recipient
              </Button>
            </div>
          )}
        </form.Field>

        {isOverBalance && (
          <p className="text-red-400 text-xs">Total amount exceeds balance</p>
        )}

        <form.Subscribe selector={(state) => [state.canSubmit]}>
          {([canSubmit]) => (
            <div className="grid grid-cols-5 gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-none hover:cursor-pointer col-span-1"
                onClick={() => form.reset()}
              >
                <Eraser className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-none hover:cursor-pointer col-span-2"
                disabled={!canSubmit || isOverBalance || writeContract.isPending || isConfirming}
                onClick={() => setShowTxObject((prev) => !prev)}
              >
                Request
              </Button>
              <Button
                type="submit"
                className="rounded-none hover:cursor-pointer col-span-2"
                disabled={!canSubmit || isOverBalance || writeContract.isPending || isConfirming}
              >
                {writeContract.isPending || isConfirming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Send batch"
                )}
              </Button>
            </div>
          )}
        </form.Subscribe>

        {showTxObject && (
          <TransactionObject
            transactionObject={simulatedTx?.request ?? null}
            isLoading={isLoadingSimulate}
            isError={isErrorSimulate}
          />
        )}

        {submitError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <TransactionStatus
          isPending={writeContract.isPending}
          isConfirming={isConfirming}
          isConfirmed={isConfirmed}
          txHash={writeContract.data}
          blockExplorerUrl={blockExplorerUrl}
        />
      </div>
    </form>
  );
}

// ── row-level field info ──────────────────────────────────────────────────────

function AddressRowStatus({
  field,
  ensAddress,
  isLoadingEns,
  isErrorEns,
}: {
  field: AnyFieldApi;
  ensAddress?: Address | null;
  isLoadingEns: boolean;
  isErrorEns: boolean;
}) {
  if (!field.state.meta.isTouched) {
    return <em className="text-xs">Enter address or ENS</em>;
  }
  if (!field.state.meta.isValid) {
    return (
      <em
        className={`text-xs ${
          field.state.meta.errors.join(",") === "Please enter an address or ENS"
            ? ""
            : "text-red-400"
        }`}
      >
        {field.state.meta.errors.join(",")}
      </em>
    );
  }
  if (isLoadingEns) return <Skeleton className="w-16 h-3" />;
  if (isErrorEns) return <span className="text-red-400 text-xs">ENS failed</span>;
  if (ensAddress) return <em className="text-green-500 text-xs truncate block">{ensAddress}</em>;
  if (ensAddress === null) return <span className="text-red-400 text-xs">Invalid ENS</span>;
  return <em className="text-green-500 text-xs">ok!</em>;
}

function AmountRowStatus({ field }: { field: AnyFieldApi }) {
  if (!field.state.meta.isTouched) {
    return <em className="text-xs">Enter amount</em>;
  }
  if (!field.state.meta.isValid) {
    return (
      <em
        className={`text-xs ${
          field.state.meta.errors.join(",") === "Please enter an amount"
            ? ""
            : "text-red-400"
        }`}
      >
        {field.state.meta.errors.join(",")}
      </em>
    );
  }
  return <em className="text-green-500 text-xs">ok!</em>;
}

// ── parseRecipients ───────────────────────────────────────────────────────────

type ParsedRecipient = { address: Address; amount: string };
type ParseError = { line: number; text: string; reason: string };
type ParseResult = { valid: ParsedRecipient[]; errors: ParseError[] };

function parseRecipients(text: string): ParseResult {
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

// ── TextEditor ────────────────────────────────────────────────────────────────

function TextEditor({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
}: {
  nativeBalance: { value: bigint; symbol: string; decimals: number } | undefined;
  isLoadingNativeBalance: boolean;
  atomicBatchSupported: boolean;
  selectedChain: number | null;
}) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const { theme } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [text, setText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);

  const parsed = useMemo(() => parseRecipients(text), [text]);

  let totalAmount = BigInt(0);
  for (const r of parsed.valid) {
    try {
      totalAmount += parseEther(r.amount);
    } catch {
      // ignore
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";
  const canSubmit = parsed.valid.length > 0 && parsed.errors.length === 0 && !isOverBalance;

  const simulatedAddresses = parsed.valid.map((r) => r.address);
  const simulatedAmounts = parsed.valid.map((r) => {
    try {
      return parseEther(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract({
    address: GASLITEDROP_CONTRACT_ADDRESS,
    abi: GasliteDropAbi,
    functionName: "airdropETH",
    args: [simulatedAddresses, simulatedAmounts],
    value: totalAmount,
    query: {
      enabled: showTxObject && simulatedAddresses.length > 0 && totalAmount > BigInt(0),
    },
  });

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseEther(r.amount));
      const total = amounts.reduce((a, b) => a + b, BigInt(0));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
      } else {
        await writeContract.mutateAsync({
          address: GASLITEDROP_CONTRACT_ADDRESS,
          abi: GasliteDropAbi,
          functionName: "airdropETH",
          args: [addresses, amounts],
          value: total,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* balance + running total */}
      <div className="flex flex-col gap-1 text-sm items-end">
        <div className="flex flex-row gap-2 items-center">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          {isLoadingNativeBalance ? (
            <Skeleton className="w-24 h-4" />
          ) : (
            <span>
              {formatEther(nativeBalance?.value ?? BigInt(0))} {symbol}
            </span>
          )}
        </div>
        <div className="flex flex-row gap-2 items-center">
          <Sigma className="w-4 h-4 text-muted-foreground" />
          <span className={isOverBalance ? "text-red-400" : ""}>
            {formatEther(totalAmount)} {symbol}
          </span>
        </div>
      </div>

      {/* editor */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">
          One recipient per line: <code>address,amount</code>. Lines starting with{" "}
          <code>#</code> are ignored.
        </label>
        <Suspense fallback={<div className="h-48 w-full bg-muted/50 animate-pulse border" />}>
          <CodeMirror
            value={text}
            onChange={setText}
            extensions={[EditorView.lineWrapping]}
            theme={isDark ? githubDark : githubLight}
            placeholder={"0xRecipient1,0.01\n0xRecipient2,0.05\n# comment"}
            height="200px"
            className="rounded-none text-xs"
          />
        </Suspense>
      </div>

      {/* parse status */}
      {text.trim() && (
        <div className="flex flex-col gap-1 text-xs">
          {parsed.valid.length > 0 && (
            <span className="text-green-500">
              {parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}
            </span>
          )}
          {parsed.errors.map((e) => (
            <span key={e.line} className="text-red-400">
              Line {e.line}: {e.reason} — <code>{e.text}</code>
            </span>
          ))}
          {isOverBalance && (
            <span className="text-red-400">Total amount exceeds balance</span>
          )}
        </div>
      )}

      {/* actions */}
      <div className="grid grid-cols-5 gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-none hover:cursor-pointer col-span-1"
          onClick={() => setText("")}
        >
          <Eraser className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={() => setShowTxObject((prev) => !prev)}
        >
          Request
        </Button>
        <Button
          type="button"
          className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={handleSubmit}
        >
          {writeContract.isPending || isConfirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Send batch"
          )}
        </Button>
      </div>

      {showTxObject && (
        <TransactionObject
          transactionObject={simulatedTx?.request ?? null}
          isLoading={isLoadingSimulate}
          isError={isErrorSimulate}
        />
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <TransactionStatus
        isPending={writeContract.isPending}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        txHash={writeContract.data}
        blockExplorerUrl={blockExplorerUrl}
      />
    </div>
  );
}

// ── FileUpload ────────────────────────────────────────────────────────────────

const SAMPLE_CSV = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0.01
0x91ab3daa9086D719Ebf8c96Ea6Ca3d94e9dF2b8A,0.05`;

function FileUpload({
  nativeBalance,
  isLoadingNativeBalance,
  atomicBatchSupported,
  selectedChain,
}: {
  nativeBalance: { value: bigint; symbol: string; decimals: number } | undefined;
  isLoadingNativeBalance: boolean;
  atomicBatchSupported: boolean;
  selectedChain: number | null;
}) {
  const config = useConfig();
  const blockExplorerUrl = config.chains.find((c) => c.id === selectedChain)?.blockExplorers?.default.url;

  const writeContract = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: writeContract.data });

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTxObject, setShowTxObject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (fileText !== null ? parseRecipients(fileText) : null), [fileText]);

  let totalAmount = BigInt(0);
  for (const r of parsed?.valid ?? []) {
    try {
      totalAmount += parseEther(r.amount);
    } catch {
      // ignore
    }
  }

  const isOverBalance = nativeBalance ? totalAmount > nativeBalance.value : false;
  const symbol = nativeBalance?.symbol ?? "ETH";
  const canSubmit = (parsed?.valid.length ?? 0) > 0 && (parsed?.errors.length ?? 1) === 0 && !isOverBalance;

  const simulatedAddresses = (parsed?.valid ?? []).map((r) => r.address);
  const simulatedAmounts = (parsed?.valid ?? []).map((r) => {
    try {
      return parseEther(r.amount);
    } catch {
      return BigInt(0);
    }
  });

  const {
    data: simulatedTx,
    isLoading: isLoadingSimulate,
    isError: isErrorSimulate,
  } = useSimulateContract({
    address: GASLITEDROP_CONTRACT_ADDRESS,
    abi: GasliteDropAbi,
    functionName: "airdropETH",
    args: [simulatedAddresses, simulatedAmounts],
    value: totalAmount,
    query: {
      enabled: showTxObject && simulatedAddresses.length > 0 && totalAmount > BigInt(0),
    },
  });

  function loadFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setFileName(file.name);
      setFileText("");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setFileText((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  function handleClear() {
    setFileName(null);
    setFileText(null);
    setSubmitError(null);
    setShowTxObject(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitError(null);
    try {
      const addresses = parsed.valid.map((r) => r.address);
      const amounts = parsed.valid.map((r) => parseEther(r.amount));
      const total = amounts.reduce((a, b) => a + b, BigInt(0));

      if (atomicBatchSupported) {
        // EIP-5792 wallet_sendCalls — TBD
      } else {
        await writeContract.mutateAsync({
          address: GASLITEDROP_CONTRACT_ADDRESS,
          abi: GasliteDropAbi,
          functionName: "airdropETH",
          args: [addresses, amounts],
          value: total,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Transaction failed");
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* balance + running total */}
      <div className="flex flex-col gap-1 text-sm items-end">
        <div className="flex flex-row gap-2 items-center">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          {isLoadingNativeBalance ? (
            <Skeleton className="w-24 h-4" />
          ) : (
            <span>
              {formatEther(nativeBalance?.value ?? BigInt(0))} {symbol}
            </span>
          )}
        </div>
        <div className="flex flex-row gap-2 items-center">
          <Sigma className="w-4 h-4 text-muted-foreground" />
          <span className={isOverBalance ? "text-red-400" : ""}>
            {formatEther(totalAmount)} {symbol}
          </span>
        </div>
      </div>

      {/* sample format */}
      <div className="flex flex-col gap-1 border p-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Sample CSV format
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No header row. One recipient per line: <code>address,amount</code>
        </p>
        <pre className="text-xs bg-muted/50 p-2 mt-1 overflow-x-auto leading-5">{SAMPLE_CSV}</pre>
        <button
          type="button"
          className="text-xs text-primary underline underline-offset-2 self-start mt-1 hover:cursor-pointer"
          onClick={() => {
            const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "recipients-sample.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download sample
        </button>
      </div>

      {/* drop zone / file selected */}
      {fileText === null ? (
        <div
          role="button"
          tabIndex={0}
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:cursor-pointer hover:border-primary hover:text-foreground ${isDragging ? "border-primary text-foreground bg-muted/30" : ""}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-6 h-6" />
          <span>Drop a CSV file here or click to browse</span>
          <span className="text-xs">Accepts .csv files only</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* file info row */}
          <div className="flex items-center gap-2 border p-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1">{fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-none h-6 w-6 shrink-0 hover:cursor-pointer"
              onClick={handleClear}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* parse results */}
          {parsed && (
            <div className="flex flex-col gap-1 text-xs">
              {parsed.valid.length > 0 && (
                <span className="text-green-500">
                  {parsed.valid.length} valid recipient{parsed.valid.length !== 1 ? "s" : ""}
                </span>
              )}
              {parsed.errors.length > 0 && (
                <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                  {parsed.errors.map((e) => (
                    <span key={e.line} className="text-red-400">
                      Line {e.line}: {e.reason} — <code>{e.text}</code>
                    </span>
                  ))}
                </div>
              )}
              {parsed.valid.length === 0 && parsed.errors.length === 0 && (
                <span className="text-muted-foreground">No recipients found in file</span>
              )}
              {isOverBalance && (
                <span className="text-red-400">Total amount exceeds balance</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* actions */}
      <div className="grid grid-cols-5 gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-none hover:cursor-pointer col-span-1"
          onClick={handleClear}
          disabled={fileText === null}
        >
          <Eraser className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={() => setShowTxObject((prev) => !prev)}
        >
          Request
        </Button>
        <Button
          type="button"
          className="rounded-none hover:cursor-pointer col-span-2"
          disabled={!canSubmit || writeContract.isPending || isConfirming}
          onClick={handleSubmit}
        >
          {writeContract.isPending || isConfirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Send batch"
          )}
        </Button>
      </div>

      {showTxObject && (
        <TransactionObject
          transactionObject={simulatedTx?.request ?? null}
          isLoading={isLoadingSimulate}
          isError={isErrorSimulate}
        />
      )}

      {submitError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <TransactionStatus
        isPending={writeContract.isPending}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        txHash={writeContract.data}
        blockExplorerUrl={blockExplorerUrl}
      />
    </div>
  );
}
