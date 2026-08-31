import { DecisionResult } from '@/domain/decision/types';
import { TrustVerificationPanel } from './TrustVerificationPanel';

interface GuardrailViolation {
  ruleId: string;
  severity: 'block' | 'warn';
  message: string;
  threshold: number | string;
  actual: number | string;
  overrideAllowed: boolean;
}

interface GateResult {
  allowed: boolean;
  reason?: string;
  missingVariables: string[];
  lowConfidenceVariables: string[];
  warnings: string[];
  overallConfidence?: number;
}

interface DecisionResultResponse {
  decision: DecisionResult;
  gate?: GateResult;
  guardrails?: {
    blocked: boolean;
    violations: GuardrailViolation[];
    warnings: string[];
  };
}

interface DecisionResultProps {
  result: DecisionResult | DecisionResultResponse | any;
}

// Type guard to check if result is a DecisionResultResponse
function isDecisionResultResponse(result: any): result is DecisionResultResponse {
  return result && typeof result === 'object' && 'decision' in result;
}

// Extract DecisionResult from response
function getDecisionResult(result: DecisionResult | DecisionResultResponse): DecisionResult {
  if (isDecisionResultResponse(result)) {
    return result.decision;
  }
  return result;
}

export function DecisionResultComponent({ result: initialResult }: DecisionResultProps) {
  const result = getDecisionResult(initialResult);
  const responseData = isDecisionResultResponse(initialResult) ? initialResult : null;
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
    <div className="space-y-4 md:space-y-6">
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

      {/* 1a. Decision Gate Block */}
      {responseData?.gate && !responseData.gate.allowed && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive flex items-center justify-center mt-0.5">
              <span className="text-white text-xs font-bold">✕</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-destructive">
                Decision Blocked by Safety Gate
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                This decision was blocked before execution due to safety checks.
              </p>
            </div>
          </div>

          {responseData.gate.reason && (
            <div className="bg-background/50 rounded p-3 mb-4">
              <p className="text-xs text-foreground font-medium">
                {responseData.gate.reason}
              </p>
            </div>
          )}

          {responseData.gate.missingVariables && responseData.gate.missingVariables.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-foreground mb-2">Missing Variables:</p>
              <ul className="space-y-1">
                {responseData.gate.missingVariables.map((variable, index) => (
                  <li key={index} className="text-xs text-foreground flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-destructive"></span>
                    {variable}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {responseData.gate.lowConfidenceVariables && responseData.gate.lowConfidenceVariables.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-foreground mb-2">Low Confidence Variables:</p>
              <ul className="space-y-1">
                {responseData.gate.lowConfidenceVariables.map((variable, index) => (
                  <li key={index} className="text-xs text-foreground flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-warning"></span>
                    {variable}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {responseData.gate.warnings && responseData.gate.warnings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Warnings:</p>
              <ul className="space-y-1">
                {responseData.gate.warnings.map((warning, index) => (
                  <li key={index} className="text-xs text-foreground flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-warning"></span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {responseData.gate.overallConfidence !== undefined && (
            <div className="mt-4 pt-3 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground">
                Overall Confidence: <span className="font-semibold text-foreground">{(responseData.gate.overallConfidence * 100).toFixed(0)}%</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* 1b. Guardrail Violations */}
      {responseData?.guardrails && responseData.guardrails.violations && responseData.guardrails.violations.length > 0 && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive flex items-center justify-center mt-0.5">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-destructive">
                Policy Guardrail Violations
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                This decision violates one or more policy constraints.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {responseData.guardrails.violations.map((violation, index) => (
              <div key={index} className="bg-background/50 rounded p-3">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">
                    {violation.ruleId}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    violation.severity === 'block'
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-warning/20 text-warning'
                  }`}>
                    {violation.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-foreground mb-2">
                  {violation.message}
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Threshold:</span>
                    <span className="font-mono">{violation.threshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Actual:</span>
                    <span className="font-mono">{violation.actual}</span>
                  </div>
                  {violation.overrideAllowed && (
                    <div className="text-xs text-[var(--warning-text)] pt-1 border-t border-destructive/20">
                      Override allowed with approval
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {responseData.guardrails.warnings && responseData.guardrails.warnings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-destructive/20">
              <p className="text-xs font-medium text-foreground mb-2">Warnings:</p>
              <ul className="space-y-1">
                {responseData.guardrails.warnings.map((warning, index) => (
                  <li key={index} className="text-xs text-foreground flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-warning"></span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
              <code className="block w-full break-all overflow-x-auto rounded bg-background p-2 font-mono text-xs text-foreground">
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
              <code className="block w-full break-all overflow-x-auto rounded bg-background p-2 font-mono text-xs text-foreground">
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
              <code className="block w-full break-all overflow-x-auto rounded bg-background p-2 font-mono text-xs text-foreground">
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
              <code className="block w-full break-all overflow-x-auto rounded bg-background p-2 font-mono text-xs text-foreground">
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
