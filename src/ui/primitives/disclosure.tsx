import type { HTMLAttributes, ReactNode } from "react";

/**
 * The "Why?" / "See details" progressive-disclosure pattern: evidence,
 * governance mechanics, and raw model state stay collapsed by default and
 * are one click away, rather than competing with the plain-language answer
 * above the fold. A native <details> element — no JS state, keyboard- and
 * screen-reader-accessible for free, and closed by default in every browser.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = "",
  ...rest
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
} & Omit<HTMLAttributes<HTMLDetailsElement>, "children">) {
  return (
    <details
      className={`group rounded-md border border-border open:bg-muted/30 ${className}`}
      open={defaultOpen}
      {...rest}
    >
      <summary className="cursor-pointer select-none rounded-sm px-3 py-2 text-sm font-medium text-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90">
          &#9656;
        </span>
        {summary}
      </summary>
      <div className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
