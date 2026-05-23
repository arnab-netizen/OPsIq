"use client";

import { useEffect, useState } from "react";
import { Badge, LoadingState } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance"; // used for error classification in catch blocks
import type {
  BillingDiagnosticDTO,
} from "@/lib/billing/admin-billing-diagnostics.dto";

interface DiagnosticState {
  data: BillingDiagnosticDTO | null;
  loading: boolean;
  error: string | null;
}

export default function AdminBillingPage() {
  const [workspaceId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("workspaceId") || "" : ""
  );
  const [state, setState] = useState<DiagnosticState>({
    data: null,
    loading: workspaceId ? true : false,
    error: workspaceId ? null : "Workspace ID not found",
  });

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const fetchDiagnostics = async () => {
      try {
        const res = await fetch("/api/admin/billing/diagnostics", {
          headers: {
            "x-workspace-id": workspaceId,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load billing diagnostics");
        }

        const data = await res.json();
        setState({ data, loading: false, error: null });
      } catch (error) {
        const governed = classifyOperatorError(
          error instanceof Error ? error : new Error(String(error)),
          { context: "load" }
        );
        setState((s) => ({
          ...s,
          error: governed.operatorMessage,
          loading: false,
        }));
      }
    };

    fetchDiagnostics();
  }, [workspaceId]);

  if (state.loading) {
    return <LoadingState />;
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 m-6">
        <p className="text-sm font-medium text-red-700">{state.error}</p>
      </div>
    );
  }

  if (!state.data) {
    return (
      <GovernedEmptyState reason="no_data" />
    );
  }

  const handleRefresh = async () => {
    setState({ data: state.data, loading: true, error: null });
    try {
      const res = await fetch("/api/admin/billing/diagnostics", {
        headers: {
          "x-workspace-id": workspaceId,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load billing diagnostics");
      }

      const data = await res.json();
      setState({ data, loading: false, error: null });
    } catch (error) {
      const governed = classifyOperatorError(
        error instanceof Error ? error : new Error(String(error)),
        { context: "load" }
      );
      setState({
        data: state.data,
        loading: false,
        error: governed.operatorMessage,
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Billing Diagnostics</h1>
        <p className="text-gray-600">
          Admin-safe proof surface for billing status and entitlement decisions
        </p>
      </div>

      {/* Billing Account */}
      <Section title="Billing Account">
        <DetailGrid>
          <DetailItem label="Status" value={state.data.account.status} />
          <DetailItem
            label="Workspace ID"
            value={state.data.account.workspaceId}
          />
          <DetailItem label="Account ID" value={state.data.account.billingAccountId} />
          {state.data.account.stripeCustomerId && (
            <DetailItem
              label="Stripe Customer"
              value={state.data.account.stripeCustomerId}
            />
          )}
          <DetailItem
            label="Created"
            value={new Date(state.data.account.createdAt).toLocaleDateString()}
          />
        </DetailGrid>
      </Section>

      {/* Subscription */}
      <Section title="Subscription">
        <DetailGrid>
          <DetailItem label="Status" value={state.data.subscription.status} />
          {state.data.subscription.currentPeriodStart && (
            <DetailItem
              label="Period Start"
              value={new Date(state.data.subscription.currentPeriodStart).toLocaleDateString()}
            />
          )}
          {state.data.subscription.currentPeriodEnd && (
            <DetailItem
              label="Period End"
              value={new Date(state.data.subscription.currentPeriodEnd).toLocaleDateString()}
            />
          )}
        </DetailGrid>
      </Section>

      {/* Plan */}
      {state.data.plan && (
        <Section title="Plan">
          <DetailGrid>
            <DetailItem label="Plan Name" value={state.data.plan.name} />
            <DetailItem
              label="Monthly Price"
              value={`$${state.data.plan.priceMonthly}`}
            />
            <DetailItem
              label="Yearly Price"
              value={`$${state.data.plan.priceYearly}`}
            />
            <DetailItem
              label="Capabilities"
              value={`${state.data.plan.capabilities.length} capability/ies`}
            />
          </DetailGrid>
        </Section>
      )}

      {/* Entitlement Decisions */}
      <Section title="Entitlement Decisions">
        {state.data.entitlementDecisions.length === 0 ? (
          <GovernedEmptyState reason="no_data" />
        ) : (
          <div className="space-y-2">
            {state.data.entitlementDecisions.map((decision) => (
              <EntitlementDecisionRow key={decision.capability} decision={decision} />
            ))}
          </div>
        )}
      </Section>

      {/* Usage Summary */}
      <Section title="Usage Summary">
        {state.data.usage.length === 0 ? (
          <GovernedEmptyState reason="no_data" />
        ) : (
          <div className="space-y-2">
            {state.data.usage.map((usage) => (
              <UsageRow key={usage.key} usage={usage} />
            ))}
          </div>
        )}
      </Section>

      {/* Diagnostics */}
      {state.data.diagnostics.warnings.length > 0 ||
      state.data.diagnostics.missingData.length > 0 ? (
        <Section title="Diagnostics">
          <div className="space-y-4">
            {state.data.diagnostics.warnings.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Warnings</h3>
                <ul className="space-y-1">
                  {state.data.diagnostics.warnings.map((warning, i) => (
                    <li key={i} className="text-sm text-yellow-700">
                      • {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state.data.diagnostics.missingData.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Missing Data</h3>
                <ul className="space-y-1">
                  {state.data.diagnostics.missingData.map((missing, i) => (
                    <li key={i} className="text-sm text-red-700">
                      • {missing}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      ) : null}

      {/* Refresh Button */}
      <div className="mt-8">
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh Diagnostics
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t pt-4">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="font-mono text-sm break-all">{value}</p>
    </div>
  );
}

function EntitlementDecisionRow({
  decision,
}: {
  decision: { capability: string; allowed: boolean; reason: string; percentageUsed?: number };
}) {
  return (
    <div className="flex items-center justify-between p-2 border rounded">
      <div className="flex-1">
        <p className="font-semibold text-sm">{decision.capability}</p>
        <p className="text-xs text-gray-600">{decision.reason}</p>
      </div>
      <div className="flex items-center gap-2">
        {decision.percentageUsed !== undefined && (
          <span className="text-sm text-gray-600">
            {decision.percentageUsed}% used
          </span>
        )}
        <Badge variant={decision.allowed ? "success" : "destructive"}>
          {decision.allowed ? "Allowed" : "Denied"}
        </Badge>
      </div>
    </div>
  );
}

function UsageRow({ usage }: { usage: { key: string; value: number; limit?: number | null; percentageUsed?: number } }) {
  return (
    <div className="flex items-center justify-between p-2 border rounded">
      <p className="font-semibold text-sm">{usage.key}</p>
      <div className="text-right">
        <p className="text-sm font-mono">{usage.value}</p>
        {usage.limit !== null && usage.limit !== undefined && (
          <p className="text-xs text-gray-600">
            limit: {usage.limit}
            {usage.percentageUsed && ` (${usage.percentageUsed}%)`}
          </p>
        )}
      </div>
    </div>
  );
}
