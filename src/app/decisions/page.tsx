import { DecisionInboxTable } from "@/components/decisions/DecisionInboxTable";

export const metadata = {
  title: "Decision Inbox | OPsIQ",
  description: "Govern and approve business decisions",
};

export default function DecisionsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Decision Inbox</h1>
          <p className="text-gray-600 mt-2">
            Review, approve, and govern decisions across your organization
          </p>
        </div>

        {/* Inbox Table */}
        <DecisionInboxTable />
      </div>
    </div>
  );
}
