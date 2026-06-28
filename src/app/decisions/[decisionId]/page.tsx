import { redirect } from "next/navigation";

interface DecisionDetailPageProps {
  params: {
    decisionId: string;
  };
}

export const metadata = {
  title: "Decision Detail",
  description: "Review decision details and make approval decision",
};

/**
 * GAP-UI-01 — this legacy route previously rendered governance controls (approve / reject /
 * override) over hardcoded MOCK data with an empty audit trail, which an owner could mistake
 * for a real governed decision. There is no production data source behind it. The canonical,
 * secured decision surface is `/dashboard/decision/[id]` (DecisionDetailView), which loads the
 * real decision, enforces auth/workspace server-side, and posts to existing routes. This page
 * now redirects there so no fabricated governance surface is reachable.
 */
export default async function DecisionDetailPage({ params }: DecisionDetailPageProps) {
  redirect(`/dashboard/decision/${params.decisionId}`);
}
