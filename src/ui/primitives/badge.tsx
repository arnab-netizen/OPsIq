type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-blue-600 text-white border-blue-700",
  success: "bg-green-600 text-white border-green-700",
  warning: "bg-amber-600 text-white border-amber-700",
  destructive: "bg-red-600 text-white border-red-700",
  outline: "bg-transparent text-foreground border-border",
  muted: "bg-slate-500 text-white border-slate-600",
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
