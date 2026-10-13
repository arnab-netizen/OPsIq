import Image from "next/image";
import Link from "next/link";
import { PublicBetaCta } from "@/components/landing/PublicBetaCta";

/**
 * Shared header for every logged-out public page (homepage, /about, ...) so the brand
 * treatment and primary nav (Sign in / Request beta access) stay identical across all of them,
 * not re-implemented per page.
 */
export function PublicSiteHeader({ admissionMode = null }: { admissionMode?: string | null } = {}) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="shrink-0">
        <Image src="/opsiq-logo.png" alt="OpsIQ home" width={1864} height={541} priority className="h-9 w-auto" />
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-3">
        <Link href="/tools/profit-margin-calculator" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">Calculators</Link>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">
          Sign in
        </Link>
        <PublicBetaCta triggerClassName="inline-flex min-h-11 items-center border-0 bg-transparent px-1 text-sm font-medium text-[var(--primary-text)] hover:underline" initialMode={admissionMode} />
      </nav>
    </header>
  );
}
