import { redirect } from "next/navigation";
import { getSession, getPolicyContext } from "@/services/auth";
import { isSelfServeOwnerContext } from "@/policies/capability-check";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

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

  return <LandingPage />;
}
