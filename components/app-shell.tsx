import { LogOut } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { NavLinks } from "@/components/nav-links";
import { Tutorial, TutorialButton } from "@/components/tutorial";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { alpacaConfigured } from "@/lib/config";
import { signOut } from "@/app/login/actions";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const simulated = !alpacaConfigured();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6 md:h-14 md:flex-nowrap md:py-0">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            TrustVest
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-4">
            <TutorialButton />
            <LiveRefresh />
            <span className="hidden text-xs text-muted-foreground md:inline">{user.email}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                <LogOut />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      {simulated && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-200">
          <p className="mx-auto max-w-6xl px-4 py-2 text-xs sm:px-6">
            Demo mode: prices and news are generated for practice because no market-data connection is set up yet (admin: add
            the Alpaca keys to switch to real market prices).
          </p>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <Tutorial />
    </div>
  );
}
