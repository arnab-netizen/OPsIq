import {
  MonetizationDecision,
  getSeverityColor,
  getSeverityBgColor,
  getRiskColor,
  formatCurrency,
  formatPercentage,
} from "@/domain/decision/monetization";

interface MonetizationDecisionCardProps {
  decision: MonetizationDecision;
}

/**
 * Enterprise monetization-grade decision card.
 * Displays: problem, cost, action, impact, confidence, and blocking status.
 * Color-coded severity and risk indicators.
 */
export function MonetizationDecisionCard({
  decision,
}: MonetizationDecisionCardProps) {
  return (
    <div className="w-full space-y-6">
      {/* BLOCKED STATE BANNER */}
      {decision.blocked && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-xs mt-0.5">
              ✕
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900">
                Decision Blocked
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {decision.blockReason ||
                  "This decision cannot be executed due to safety or data constraints."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* 1. WHAT'S WRONG */}
        <div
          className={`rounded-lg border p-4 md:p-6 ${getSeverityBgColor(decision.severity)}`}
        >
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Problem
          </h3>
          <p className="text-sm md:text-base font-medium text-foreground leading-relaxed">
            {decision.problem}
          </p>
          <div className="mt-4 pt-4 border-t border-current opacity-20">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${getSeverityColor(decision.severity)}`}
            >
              {decision.severity.toUpperCase()} Severity
            </span>
          </div>
        </div>

        {/* 2. WHAT IT COSTS */}
        <div className="rounded-lg border border-border bg-background p-4 md:p-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Estimated Loss
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-destructive">
            {formatCurrency(decision.estimatedLoss)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {decision.timeframe
              ? `Impact timeframe: ${decision.timeframe}`
              : "If no action is taken"}
          </p>
        </div>

        {/* 3. WHAT TO DO */}
        <div className="rounded-lg border border-border bg-background p-4 md:p-6 md:col-span-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recommended Action
          </h3>
          <p className="text-sm md:text-base font-medium text-foreground leading-relaxed">
            {decision.recommendedAction}
          </p>
        </div>

        {/* 4. WHAT HAPPENS */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 md:p-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Expected Impact
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-green-700">
            {formatCurrency(decision.expectedImpact)}
          </p>
          <p className="text-xs text-green-600 mt-2">
            Positive impact if action is taken
          </p>
        </div>

        {/* 5. CONFIDENCE & RISK */}
        <div className="rounded-lg border border-border bg-background p-4 md:p-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Confidence Level
              </h4>
              <p className="text-2xl font-bold text-foreground">
                {formatPercentage(decision.confidence)}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full ${
                    decision.confidence >= 0.8
                      ? "bg-green-600"
                      : decision.confidence >= 0.6
                        ? "bg-yellow-600"
                        : "bg-red-600"
                  }`}
                  style={{ width: `${decision.confidence * 100}%` }}
                />
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Risk Level
              </h4>
              <p
                className={`text-sm font-semibold uppercase ${getRiskColor(decision.riskLevel)}`}
              >
                {decision.riskLevel}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SCENARIO ANALYSIS */}
      <div className="rounded-lg border border-border bg-background p-4 md:p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          What-If Scenarios
        </h3>

        <div className="space-y-4">
          {/* Baseline */}
          <div className="pb-4 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Baseline (No Action)
            </h4>
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(decision.scenarios.baseline.impact)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Status quo impact
            </p>
          </div>

          {/* Recommended */}
          <div className="pb-4 border-b border-border">
            <h4 className="text-xs font-semibold text-green-600 uppercase mb-2">
              Recommended Path
            </h4>
            <p className="text-lg font-bold text-green-700">
              {formatCurrency(decision.scenarios.recommended.impact)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Expected outcome if action is taken
            </p>
          </div>

          {/* Alternatives */}
          {decision.scenarios.alternatives && decision.scenarios.alternatives.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                Alternative Scenarios
              </h4>
              <div className="space-y-3">
                {decision.scenarios.alternatives.map((alt, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-3 bg-muted/50 rounded"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {alt.name}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {formatCurrency(alt.impact)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KEY METRICS SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="rounded-lg border border-border p-3 md:p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">
            ROI
          </p>
          <p className="text-lg md:text-xl font-bold text-foreground">
            {decision.estimatedLoss > 0
              ? formatPercentage(decision.expectedImpact / decision.estimatedLoss)
              : "N/A"}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3 md:p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Net Benefit
          </p>
          <p
            className={`text-lg md:text-xl font-bold ${
              decision.expectedImpact - decision.estimatedLoss >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {formatCurrency(
              decision.expectedImpact - decision.estimatedLoss
            )}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3 md:p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Payback
          </p>
          <p className="text-lg md:text-xl font-bold text-foreground">
            {decision.estimatedLoss > 0 && decision.expectedImpact > 0
              ? `${(
                  (decision.estimatedLoss / decision.expectedImpact) *
                  12
                ).toFixed(0)} mo.`
              : "Immediate"}
          </p>
        </div>

        <div className="rounded-lg border border-border p-3 md:p-4 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Status
          </p>
          <p
            className={`text-lg md:text-xl font-bold ${
              decision.blocked ? "text-red-600" : "text-green-600"
            }`}
          >
            {decision.blocked ? "Blocked" : "Ready"}
          </p>
        </div>
      </div>
    </div>
  );
}
