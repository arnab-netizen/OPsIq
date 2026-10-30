import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveAuthenticatedRootDecision } from "@/services/root-redirect.service";
import { presentationForAdmissionMode } from "@/domain/beta/public-presentation";
import { getPublicAdmissionMode } from "@/services/beta/public-presentation.service";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

const SITE_URL = "https://opsiq.solutions";
const OG_TITLE = "OpsIQ - Diagnose your business. Know your next move.";
const OG_DESCRIPTION =
  "OpsIQ reads your business numbers, tells you what needs attention and why, and gives you an ordered plan for what to do next. Free beta, no card required.";
// Describes what /public/og-image.png actually shows (verified against the real file): the
// OpsIQ wordmark, the "Free beta · no credit card required" badge, the headline, and the
// opsiq.solutions footer text -- not marketing copy invented for this purpose.
const OG_IMAGE_ALT =
  "OpsIQ wordmark with the headline \"Diagnose your business. Know your next move,\" a free beta badge, and the opsiq.solutions URL.";

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
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: [{ url: "/og-image.png", alt: OG_IMAGE_ALT }],
  },
};

function softwareApplicationJsonLd(offerDescription: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#software`,
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
      description: offerDescription,
    },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
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
  // F4/F-AUTH-ROOT-SINGLE-TX: the session validation, policy check, owner-login-href resolution, and
  // the fail-closed/bounded decision logic all live in resolveAuthenticatedRootDecision() -- this
  // page only renders the decision, it makes none of it. A self-serve owner's canonical
  // first-run/Home surface is /owner/cockpit (labeled "Home" in the persona-sectioned nav — see
  // sidebar-nav.tsx), not the consultant-oriented /dashboard (engagements/findings/actions —
  // concepts a self-serve owner never has); which one a given redirect resolves to is the service's
  // decision, never this page's.
  const decision = await resolveAuthenticatedRootDecision();
  if (decision.kind === "redirect") {
    redirect(decision.href);
  }
  // decision.kind === "anonymous": no positively-proven session (missing/invalid/revoked/expired
  // cookie, or an inactive user) -- render the same public landing experience as any logged-out
  // visitor, never a redirect.
  const settingsMode = await getPublicAdmissionMode();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd(presentationForAdmissionMode(settingsMode).offerDescription)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <LandingPage admissionMode={settingsMode ?? "INVITE_ONLY"} />
    </>
  );
}
