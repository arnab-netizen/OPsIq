import type { HTMLAttributes, ReactNode } from "react";

/**
 * Canonical outer content wrapper for an owner-facing page's body.
 *
 * AppShell's own <main> (src/ui/shell/app-shell.tsx) already provides a
 * single, consistent p-6 (24px) gutter around every route's content — a
 * page component should never add its own additional outer padding on top
 * of that (the root cause of the 14 Sep 2026 UI/UX audit's G4 finding:
 * page containers measured at different starting x-offsets — 264/280/288/
 * 296/340/380px — because individual pages stacked their own ad hoc
 * px-4/p-6/py-8 wrapper on top of the shell's own padding, each by a
 * different amount). This primitive only centers content up to the design
 * doc's (docs/OPSIQ_DESIGN_DIRECTION.md §6) 1120px desktop ceiling — it
 * adds no padding of its own, so nesting it inside AppShell's <main> never
 * accumulates.
 *
 * `narrow` is the documented exception for a reading/form-only layout
 * (Feedback, Help) that should stay well short of the full 1120px width —
 * not a general per-route override.
 */
export function PageContainer({
  children,
  narrow = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  narrow?: boolean;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div className={`mx-auto w-full ${narrow ? "max-w-[720px]" : "max-w-[1120px]"} ${className}`} {...rest}>
      {children}
    </div>
  );
}
