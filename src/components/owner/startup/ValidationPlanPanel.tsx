"use client";

interface Props {
  plan: Record<string, unknown>;
}

export function ValidationPlanPanel({ plan }: Props) {
  const experimentCount = plan.experimentCount as number | undefined;
  const passCriteria = plan.passCriteria as string | undefined;
  const failCriteria = plan.failCriteria as string | undefined;
  const spendingLimitCents = plan.spendingLimitCents as number | null | undefined;

  return (
    <div className="validation-plan-panel border rounded p-4 text-sm UNTESTED_ASSUMPTION">
      <p className="font-semibold mb-2">Validation Plan</p>
      {experimentCount !== undefined && <p className="text-xs text-muted-foreground mb-1">{experimentCount} experiments planned</p>}
      {passCriteria && <p className="text-xs mb-1"><strong>Pass:</strong> {passCriteria}</p>}
      {failCriteria && <p className="text-xs mb-1"><strong>Fail:</strong> {failCriteria}</p>}
      {spendingLimitCents != null && (
        <p className="text-xs text-muted-foreground BINDING_CONSTRAINT">
          Spending limit: ${(spendingLimitCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </p>
      )}
    </div>
  );
}
