type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "muted"
  | "destructive-accessible"
  | "muted-accessible"
  | "warning-accessible"
  | "success-accessible"
  | "default-accessible";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  outline: "bg-transparent text-foreground border-border",
  muted: "bg-muted text-muted-foreground border-border",
  // "destructive"/"muted" above were deliberately left out of the PR #385 readable-text fix (see
  // globals.css's --destructive-text/--muted-foreground-accessible comment) and every existing
  // consumer keeps using them unchanged. These two variants are new and opt-in, for the specific
  // owner-facing severity/confidence badges that axe found failing 4.5:1 on their own tinted fill
  // (Home, Onboarding, My Business) — same fill color, same semantic meaning, only the text color
  // is the new AA-passing token, consumed as a raw CSS var per globals.css's Turbopack-safe rule.
  "destructive-accessible": "bg-destructive/10 text-[var(--destructive-text)] border-destructive/20",
  "muted-accessible": "bg-muted text-[var(--muted-foreground-accessible)] border-border",
  // Same opt-in pattern, extended after a Lighthouse re-run found "warning"/"success"/"default"
  // failing the exact same way on their own tinted fill (see globals.css's
  // --warning-badge-text/--success-badge-text comment). "default-accessible" reuses the
  // already-existing --primary-text token -- it already clears this tint with margin in both
  // themes, it just was never applied to Badge's own "default" variant.
  "warning-accessible": "bg-warning/10 text-[var(--warning-badge-text)] border-warning/20",
  "success-accessible": "bg-success/10 text-[var(--success-badge-text)] border-success/20",
  "default-accessible": "bg-primary/10 text-[var(--primary-text)] border-primary/20",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
