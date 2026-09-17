import Image from "next/image";
import Link from "next/link";
import { BetaAccessCta } from "@/components/landing/BetaAccessCta";

/**
 * Shared header for every logged-out public page (homepage, /about, ...) so the brand
 * treatment and primary nav (Sign in / Request beta access) stay identical across all of them,
 * not re-implemented per page.
 */
export function PublicSiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="shrink-0">
        <Image src="/opsiq-logo.png" alt="OpsIQ" width={1864} height={541} priority className="h-9 w-auto" />
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-3">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Sign in
        </Link>
        <BetaAccessCta triggerClassName="border-0 bg-transparent p-0 text-sm font-medium text-[var(--primary-text)] hover:underline" />
      </nav>
    </header>
  );
}
