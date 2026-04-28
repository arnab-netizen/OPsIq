import { DecisionResult } from '@/domain/decision/types';
import { TrustVerificationPanel } from './TrustVerificationPanel';

interface DecisionResultProps {
  result: DecisionResult;
}

export function DecisionResultComponent({ result }: DecisionResultProps) {
  const getDecisionColor = (decision: string): string => {
    return decision === 'APPROVED'
      ? 'text-success'
      : 'text-destructive';
  };

  const getDecisionBgColor = (decision: string): string => {
    return decision === 'APPROVED'
      ? 'bg-success/10'
      : 'bg-destructive/10';
  };

  return (
    <div className="space-y-6">
      {/* 1. Decision Status */}
      <div className={`rounded-lg border border-border ${getDecisionBgColor(result.decision)} p-6`}>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          Decision
        </h2>
        <p className={`text-2xl font-bold ${getDecisionColor(result.decision)}`}>
          {result.decision}
        </p>
        {result.reason && (
          <p className="mt-2 text-sm text-muted-foreground">
            Reason: <span className="font-medium">{result.reason}</span>
          </p>
        )}
      </div>

      {/* 2. Expected Impact */}
      <div className="rounded-lg border border-border bg-accent p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Expected Impact
        </h3>
        <p className="text-2xl font-bold text-foreground">
          ${result.expectedImpact.toFixed(2)}
        </p>
      </div>

      {/* 3. Confidence */}
      <div className="rounded-lg border border-border bg-accent p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Confidence
        </h3>
        <p className="text-2xl font-bold text-foreground">
          {(result.confidence * 100).toFixed(0)}%
        </p>
      </div>

      {/* 4. Explanation Summary */}
      <div className="rounded-lg border border-border bg-accent p-6">
        <h3 className="text-sm font-medium text-foreground mb-3">
          Summary
        </h3>
        <p className="text-sm text-foreground leading-relaxed">
          {result.explanation.summary}
        </p>
      </div>

      {/* 5. Drivers */}
      {result.explanation.drivers && result.explanation.drivers.length > 0 ? (
        <div className="rounded-lg border border-border bg-accent p-6">
          <h3 className="text-sm font-medium text-foreground mb-4">
            Drivers
          </h3>
          <div className="space-y-3">
            {result.explanation.drivers.map((driver, index) => (
              <div key={index} className="border-l-4 border-primary pl-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    {driver.type}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    ${driver.value.toFixed(2)}
                  </span>
                </div>
                {driver.label && (
                  <p className="text-sm text-foreground">
                    {driver.label}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 6. Risks */}
      {result.explanation.risks && result.explanation.risks.length > 0 ? (
        <div className="rounded-lg border border-warning bg-warning/5 p-6">
          <h3 className="text-sm font-medium text-foreground mb-3">
            Risks
          </h3>
          <ul className="space-y-2">
            {result.explanation.risks.map((risk, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-warning"></span>
                <span className="text-sm text-foreground">
                  {risk}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 7. Missing Data */}
      {result.explanation.missingData && result.explanation.missingData.length > 0 ? (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-6">
          <h3 className="text-sm font-medium text-foreground mb-3">
            To Approve This Decision, You Need
          </h3>
          <ul className="space-y-2">
            {result.explanation.missingData.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-destructive"></span>
                <span className="text-sm text-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 8. Calculation Trace */}
      <div className="rounded-lg border border-border bg-muted p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">
          Calculation Trace
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Baseline Revenue:</span>
            <span className="font-medium text-foreground">
              ${result.explanation.calculationTrace.baselineRevenue.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Baseline Cost:</span>
            <span className="font-medium text-foreground">
              ${result.explanation.calculationTrace.baselineCost.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Revenue Change:</span>
            <span className="font-medium text-foreground">
              ${result.explanation.calculationTrace.revenueChange.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost Change:</span>
            <span className="font-medium text-foreground">
              ${result.explanation.calculationTrace.costChange.toFixed(2)}
            </span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net Impact:</span>
              <span className="font-bold text-foreground">
                ${result.explanation.calculationTrace.netImpact.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{result.explanation.calculationTrace.formula}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 9. Integrity Proof */}
      <div className="rounded-lg border border-border bg-accent p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">
          Integrity Proof
        </h3>
        <div className="space-y-4 text-sm">
          {/* Decision Hash */}
          {result.decisionHash ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Decision Hash (SHA256)
              </p>
              <code className="block break-all rounded bg-background p-2 font-mono text-xs text-foreground">
                {result.decisionHash}
              </code>
            </div>
          ) : null}

          {/* Signed Hash (Legacy HMAC) */}
          {result.signedHash ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Signed Hash (HMAC-SHA256)
              </p>
              <code className="block break-all rounded bg-background p-2 font-mono text-xs text-foreground">
                {result.signedHash}
              </code>
            </div>
          ) : null}

          {/* Asymmetric Signature */}
          {result.signature ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Signature (Asymmetric)
              </p>
              <code className="block break-all rounded bg-background p-2 font-mono text-xs text-foreground">
                {result.signature}
              </code>
              {result.signatureAlgo && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Algorithm: {result.signatureAlgo}
                </p>
              )}
            </div>
          ) : null}

          {/* Public Key ID */}
          {result.publicKeyId ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Public Key ID
              </p>
              <code className="block rounded bg-background p-2 font-mono text-xs text-foreground">
                {result.publicKeyId}
              </code>
            </div>
          ) : null}

          {/* Engine Version */}
          {result.engineVersion ? (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Engine Version: <span className="font-mono font-medium">{result.engineVersion}</span>
              </p>
            </div>
          ) : null}

          {/* Timestamp */}
          {result.inputsSnapshot?.timestamp && typeof result.inputsSnapshot.timestamp === 'string' ? (
            <div>
              <p className="text-xs text-muted-foreground">
                Generated: <span className="font-medium">{new Date(result.inputsSnapshot.timestamp).toLocaleString()}</span>
              </p>
            </div>
          ) : null}

          {/* Verification Panel */}
          <div className="pt-4 border-t border-border">
            <TrustVerificationPanel
              inputsSnapshot={result.inputsSnapshot}
              decisionHash={result.decisionHash}
              signedHash={result.signedHash}
              signature={result.signature}
              engineVersion={result.engineVersion}
            />
          </div>
        </div>
      </div>

      {/* Assumptions */}
      {result.explanation.assumptions && result.explanation.assumptions.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted p-6">
          <h3 className="text-sm font-medium text-foreground mb-3">
            Assumptions
          </h3>
          <ul className="space-y-2">
            {result.explanation.assumptions.map((assumption, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary"></span>
                <span className="text-sm text-foreground">
                  {assumption}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
