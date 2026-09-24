import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg text-gray-600 mt-4">Page not found</p>
      <nav aria-label="Helpful links" className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <Link href="/" className="text-[var(--primary-text)] hover:underline">
          Go to the OpsIQ homepage
        </Link>
        <Link href="/resources" className="text-[var(--primary-text)] hover:underline">
          Browse resources
        </Link>
      </nav>
    </main>
  );
}
