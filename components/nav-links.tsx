"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/decisions", label: "AI decisions" },
  { href: "/ledger", label: "Audit ledger" },
  { href: "/ai", label: "Is the AI working?" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="order-last -mx-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto">
      {LINKS.map((l) => {
        const active = l.href === "/dashboard" ? path === "/dashboard" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
