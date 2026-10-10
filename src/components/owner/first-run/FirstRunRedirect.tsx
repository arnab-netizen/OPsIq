"use client";

/**
 * A signed-in owner with no business is sent to the one first-run surface (which already knows the business
 * name from signup) instead of being asked to create a business by hand. The link is the no-JS fallback.
 */
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function FirstRunRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/owner/first-run");
  }, [router]);
  return (
    <p className="text-sm text-muted-foreground" data-testid="first-run-redirect">
      Taking you to set up your business… <Link href="/owner/first-run" className="underline">Continue</Link>
    </p>
  );
}
