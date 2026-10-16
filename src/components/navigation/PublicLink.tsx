import Link from "next/link";
import type { ComponentProps } from "react";
import { isDocumentNavigationRequired } from "@/lib/analytics/clarity-policy";

type PublicLinkProps = Omit<ComponentProps<"a">, "href"> & { href: string };

/**
 * The link for every in-app target reachable from OpsIQ's public pages.
 *
 * Public pages may run consent-gated Microsoft Clarity, which cannot be stopped once loaded. Next.js client-side
 * navigation keeps ONE document alive, so a soft navigation from a public page to /login, /signup or any other
 * non-public route would carry a live Clarity runtime into a private surface. This component decides per target:
 * a Clarity-eligible public target stays a client-side `Link`; anything else renders a plain anchor, i.e. a
 * deliberate FULL-DOCUMENT navigation that destroys the current document (and any Clarity runtime in it).
 * The decision is made by the same policy module that gates Clarity, so the two cannot drift apart.
 *
 * Server-component safe (no client hooks).
 */
export function PublicLink({ href, children, ...rest }: PublicLinkProps) {
  if (isDocumentNavigationRequired(href)) {
    // Intentional full-document navigation (privacy boundary), not an oversight: see the component comment above.
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
