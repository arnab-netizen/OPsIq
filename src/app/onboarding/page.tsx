import { getSession } from "@/services/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { OnboardingRecoveryForm } from "./onboarding-recovery-form";

export const dynamic = "force-dynamic";

/**
 * Public signup already creates the initial workspace, membership, role
 * assignment and session in one transaction — this page must never create a
 * second workspace, and a GET here must never mutate anything. It only reads
 * whether the account already has an active workspace and routes
 * accordingly: an already-initialized owner is sent straight to their
 * destination, and only a genuinely zero-workspace account (a pre-fix
 * orphaned signup) sees the recovery form.
 */
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const membership = await db.workspaceMembership.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { id: true },
  });

  if (membership) {
    redirect("/owner/data");
  }

  return <OnboardingRecoveryForm />;
}
