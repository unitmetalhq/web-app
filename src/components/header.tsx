import { ThemeToggle } from "@/components/theme-toggle";
// import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletConnectButton } from "@/components/wallet-connect-dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function Header() {
  return (
    <div className="flex flex-row gap-2 items-center justify-between w-full px-4 py-2 border-b border-muted-foreground/20">
      <SidebarTrigger
        className="rounded-none hover:cursor-pointer"
        variant="ghost"
        size="icon"
      >
      </SidebarTrigger>
      <div className="flex flex-row gap-2 items-center">
        <ThemeToggle />
        <WalletConnectButton />
      </div>
    </div>
  )
}