import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { PublicPageAnalytics } from "@/components/analytics/PublicPageAnalytics";
import { shouldMountPageAnalytics } from "@/lib/analytics/public-page-analytics";
import { ClarityConsent } from "@/components/analytics/ClarityConsent";
import { resolveClarityProjectId } from "@/lib/analytics/clarity-policy";

// The editorial display face for headlines and the top-priority finding on Home — a deliberate
// departure from the generic sans-on-sans look of a default Tailwind/shadcn starter. Body copy,
// data, and controls stay on the existing system sans (font-sans) for density and familiarity;
// only headings and advisory prose opt into this face via the `font-display` utility (see
// globals.css's --font-display token). next/font self-hosts the face at build time — no runtime
// dependency on Google's CDN.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opsiq.solutions"),
  title: "OpsIQ - Business health & priorities",
  description:
    "OpsIQ helps business owners see how their business is doing, what needs attention, and what to do next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Microsoft Clarity: configured only on the Vercel production deployment with a well-formed project id (otherwise
  // null and nothing is mounted). The component itself still requires an allowlisted public route AND explicit
  // visitor consent before it loads anything. See src/lib/analytics/clarity-policy.ts.
  const clarityProjectId = resolveClarityProjectId();
  return (
    <html lang="en" className={`h-full antialiased ${sourceSerif.variable}`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {shouldMountPageAnalytics() && <PublicPageAnalytics />}
        {clarityProjectId && <ClarityConsent projectId={clarityProjectId} />}
      </body>
    </html>
  );
}
