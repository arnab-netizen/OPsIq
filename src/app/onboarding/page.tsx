import { getSession } from "@/services/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Public signup already creates the initial workspace, membership, role
 * assignment and session in one transaction — this page must never create a
 * workspace, and a GET here must never mutate anything. It only reads
 * whether the account already has an active workspace and routes
 * accordingly.
 *
 * A zero-active-membership account cannot self-repair through this page:
 * `POST /api/onboarding/workspace` is disabled (see its route file) and is
 * not reachable for a zero-workspace session in any case —
 * `withCanonicalEnforcement`'s workspace resolution rejects any session with
 * no active membership before a handler ever runs. So this state is shown
 * as a governed, non-mutating "setup incomplete" screen rather than a form
 * that would call an endpoint it can never successfully reach. A real
 * recovery mechanism for this case is a separate, explicitly-authorized
 * future workstream.
 */
export const dynamic = "force-dynamic";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">OpsIQ account setup incomplete</h1>
        <p className="text-gray-600">
          Your account doesn&apos;t have a workspace yet, and this can&apos;t be
          completed automatically. Please contact support so we can set this
          up for you.
        </p>
      </div>
    </div>
  );
}
