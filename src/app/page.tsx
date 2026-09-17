import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getPolicyContext } from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

const SITE_URL = "https://opsiq.solutions";
const OG_TITLE = "OpsIQ - Diagnose your business. Know your next move.";
const OG_DESCRIPTION =
  "OpsIQ reads your business numbers, tells you what needs attention and why, and gives you an ordered plan for what to do next. Free beta, no card required.";

export const metadata: Metadata = {
  title: OG_TITLE,
  description: OG_DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/`,
  },
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: `${SITE_URL}/`,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OpsIQ",
  url: `${SITE_URL}/`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "OpsIQ reads a business's day-to-day numbers and returns one prioritized, explained action at a time.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free open beta, no credit card required",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OpsIQ",
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/opsiq-logo.png`,
  sameAs: [
    "https://www.linkedin.com/company/opsiq-hq/",
    "https://x.com/opsiqsolutions",
  ],
  description:
    "OpsIQ reads a business's day-to-day numbers and returns one prioritized, explained action at a time. Not affiliated with any other company or product also named OpsIQ.",
};

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    // F4: a self-serve owner's canonical first-run/Home surface is /owner/cockpit (labeled "Home" in
    // the persona-sectioned nav — see sidebar-nav.tsx), not the consultant-oriented /dashboard
    // (engagements/findings/actions — concepts a self-serve owner never has). Resolved from the SAME
    // centralized policy check used everywhere else (isSelfServeOwnerContext); consultants, admins,
    // and any actor this check cannot positively resolve keep the existing /dashboard redirect
    // unchanged (fail closed to prior behavior on any error).
    let ownerHome = false;
    try {
      const policy = await getPolicyContext();
      ownerHome = policy ? isSelfServeOwnerContext(policy) : false;
    } catch {
      ownerHome = false;
    }
    redirect(ownerHome ? "/owner/cockpit" : "/dashboard");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <LandingPage />
    </>
  );
}
