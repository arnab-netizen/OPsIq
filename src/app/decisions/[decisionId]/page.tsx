import Link from "next/link";
import { DecisionDetailCard } from "@/components/decisions/DecisionDetailCard";
import { DecisionActionPanel } from "@/components/decisions/DecisionActionPanel";

interface DecisionDetailPageProps {
  params: {
    decisionId: string;
  };
}

export const metadata = {
  title: "Decision Detail | Rebilix",
  description: "Review decision details and make approval decision",
};

async function fetchDecisionDetail(decisionId: string) {
  // In production, fetch from /api/governance/metrics or a dedicated endpoint
  // For now, return mock structure
  return {
    id: decisionId,
    problem: "Capital allocation decision",
    action: "Approve $5M investment",
    impactExpected: 500000,
    impactLow: 300000,
    impactHigh: 700000,
    confidence: 0.75,
    status: "pending",
    blockStage: undefined,
    blockReason: undefined,
    createdAt: new Date().toISOString(),
    createdBy: "user-123",
    inputsSnapshot: {
      investmentAmount: "$5M",
      expectedROI: "25%",
      timeline: "12 months",
      riskLevel: "medium",
    },
  };
}

async function fetchAuditTrail(decisionId: string) {
  // In production, fetch from /api/audit/events?entityId=decisionId
  return [];
}

export default async function DecisionDetailPage({
  params,
}: DecisionDetailPageProps) {
  const [decision, auditTrail] = await Promise.all([
    fetchDecisionDetail(params.decisionId),
    fetchAuditTrail(params.decisionId),
  ]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/decisions" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            ← Back to Inbox
          </Link>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Decision Details (2/3 width) */}
          <div className="lg:col-span-2">
            <DecisionDetailCard decision={decision} auditTrail={auditTrail} />
          </div>

          {/* Action Panel (1/3 width) */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <DecisionActionPanel
                decisionId={params.decisionId}
                status={decision.status}
                blockReason={decision.blockReason}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
