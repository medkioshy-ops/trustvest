// A small "?" that explains a term in plain English on hover, tap or keyboard focus.
// CSS-only (no JS), so it works in server components.
import { GLOSSARY, type GlossaryKey } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

export function InfoTip({ term, label, className, align = "left" }: { term: GlossaryKey; label?: string; className?: string; align?: "left" | "right" }) {
  const text = GLOSSARY[term];
  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={`What does ${label ?? term} mean?`}
        className="inline-flex size-4 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] leading-none font-semibold text-muted-foreground hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={cn(
          // `hidden` (not `invisible`) so closed tooltips take no space and never widen the page on phones.
          // Opens on hover/tap, or on keyboard focus only (focus-visible): a mouse click must not leave it stuck
          // open, or several tooltips pile on top of each other.
          "pointer-events-none absolute top-6 z-50 hidden w-64 max-w-[calc(100vw-3rem)] rounded-lg border bg-popover p-3 text-xs leading-relaxed font-normal text-popover-foreground normal-case shadow-lg group-hover:block group-has-[:focus-visible]:block",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {label && <span className="mb-1 block font-semibold">{label}</span>}
        {text}
      </span>
    </span>
  );
}
