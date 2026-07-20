"use client";

/**
 * Economic scenarios panel — down/expected/up with classification badges.
 * BigInt values serialized as strings by JSON. No business logic.
 */
const CLASS_STYLE: Record<string, string> = {
  ECONOMICALLY_VIABLE: "VALIDATED text-success-foreground",
  POTENTIALLY_VIABLE: "UNTESTED_ASSUMPTION text-warning-foreground",
  CASH_FLOW_UNSAFE: "BINDING_CONSTRAINT text-destructive",
  UNVIABLE: "REJECTED_IDEA text-destructive",
  RESOURCE_INFEASIBLE: "BINDING_CONSTRAINT text-destructive",
  INSUFFICIENT_EVIDENCE: "UNKNOWN_INPUT text-muted-foreground",
  VIABLE_ONLY_IF_ASSUMPTIONS_HOLD: "UNTESTED_ASSUMPTION text-warning-foreground",
};

function formatCents(cents: string | number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface Props {
  model: Record<string, unknown>;
}

export function EconomicScenariosPanel({ model }: Props) {
  const classification = model.economicClassification as string;
  const bindingCondition = model.bindingCondition as string;
  const unknownInputs = (model.unknownInputs as string[] | undefined) ?? [];
  const scenarios = model.sensitivityScenarios as Record<string, Record<string, unknown>> | null;

  return (
    <div className="economic-scenarios-panel border rounded p-4 mt-3 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <p className="font-semibold">Economic Model</p>
        <span className={`badge badge-outline text-xs ${CLASS_STYLE[classification] ?? ""}`}>
          {classification}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{bindingCondition}</p>

      {unknownInputs.length > 0 && (
        <div className="UNKNOWN_INPUT mb-3">
          <p className="text-xs font-medium text-warning-foreground">Unknown inputs (estimates may be inaccurate):</p>
          <p className="text-xs text-muted-foreground">{unknownInputs.join(", ")}</p>
        </div>
      )}

      <div className="key-metrics grid grid-cols-3 gap-3 mb-3 text-xs">
        <div>
          <p className="text-muted-foreground">Gross Contribution</p>
          <p className="font-medium">{formatCents(model.grossContributionCents as string)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Break-even (months)</p>
          <p className="font-medium">{model.breakEvenMonths != null ? (model.breakEvenMonths as number).toFixed(1) : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Cash Runway (months)</p>
          <p className="font-medium">{model.cashRunwayMonths != null ? (model.cashRunwayMonths as number).toFixed(1) : "—"}</p>
        </div>
      </div>

      {scenarios && (
        <div className="scenarios grid grid-cols-3 gap-2 mt-2">
          {(["down", "expected", "up"] as const).map((s) => {
            const sc = scenarios[s];
            if (!sc) return null;
            const cls = CLASS_STYLE[sc.classification as string] ?? "";
            return (
              <div key={s} className={`scenario-card border rounded p-2 text-xs ${cls}`}>
                <p className="font-semibold capitalize mb-1">{s}</p>
                <p>Revenue: {formatCents(sc.monthlyRevenueCents as string)}/mo</p>
                <p>Profit: {formatCents(sc.monthlyProfitCents as string)}/mo</p>
                <p className="mt-1 text-muted-foreground">{sc.classification as string}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
