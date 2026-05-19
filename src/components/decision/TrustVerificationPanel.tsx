'use client';

import { useState } from 'react';
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
} from '@/lib/operator-error-governance';

interface TrustVerificationPanelProps {
  inputsSnapshot?: Record<string, unknown>;
  decisionHash?: string;
  signedHash?: string;
  signature?: string;
  engineVersion?: string;
}

interface VerificationResult {
  valid: boolean;
  recomputedHash?: string;
  signatureValid?: boolean;
  asymmetricValid?: boolean;
  hashMatches?: boolean;
  originalHash?: string;
}

export function TrustVerificationPanel({
  inputsSnapshot,
  decisionHash,
  signedHash,
  signature,
  engineVersion,
}: TrustVerificationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const handleVerify = async () => {
    if (!decisionHash) {
      setError('Decision hash is required for verification');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const verifyPayload = {
        inputs: inputsSnapshot,
        decisionHash,
        ...(signedHash && { signedHash }),
        ...(signature && { signature }),
        timestamp: inputsSnapshot?.timestamp,
      };

      console.log('Verifying decision with payload:', verifyPayload);

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(verifyPayload),
      });

      const data = (await response.json()) as VerificationResult;

      if (!response.ok) {
        setError('Verification request failed');
        setLoading(false);
        return;
      }

      console.log('Verification result:', data);
      setResult(data);
    } catch (err) {
      console.error('Verification error:', err);
      const ctx: ErrorGovernanceContext = { context: 'action' };
      const govErr = classifyOperatorError(err, ctx);
      setError(govErr.operatorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Verification Button */}
      <button
        onClick={handleVerify}
        disabled={loading || !decisionHash}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs md:text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      >
        {loading ? 'Verifying...' : 'Verify Decision Integrity'}
      </button>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-2 md:p-3">
          <p className="text-xs md:text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Verification Results */}
      {result && (
        <div className="space-y-3 md:space-y-4">
          {/* Overall Status */}
          <div
            className={`rounded-lg border p-2 md:p-3 ${
              result.valid
                ? 'border-success bg-success/5'
                : 'border-destructive bg-destructive/5'
            }`}
          >
            <p className="text-xs md:text-sm font-medium">
              Verification Status:{' '}
              <span className={result.valid ? 'text-success' : 'text-destructive'}>
                {result.valid ? '✓ Valid' : '✗ Invalid'}
              </span>
            </p>
            {!result.valid && (
              <p className="mt-1 text-xs text-destructive">
                ⚠️ Decision integrity could not be verified. This may indicate tampering.
              </p>
            )}
          </div>

          {/* Hash Match Status */}
          {result.hashMatches !== undefined && (
            <div className="rounded-lg border border-border bg-muted p-2 md:p-3">
              <p className="text-xs md:text-sm">
                <span className="font-medium">Hash Match:</span>{' '}
                <span className={result.hashMatches ? 'text-success' : 'text-destructive'}>
                  {result.hashMatches ? '✓ Verified' : '✗ Mismatch'}
                </span>
              </p>
            </div>
          )}

          {/* HMAC Signature Status */}
          {result.signatureValid !== undefined && (
            <div className="rounded-lg border border-border bg-muted p-2 md:p-3">
              <p className="text-xs md:text-sm">
                <span className="font-medium">HMAC Signature (Legacy):</span>{' '}
                <span className={result.signatureValid ? 'text-success' : 'text-muted-foreground'}>
                  {result.signatureValid ? '✓ Valid' : '○ Not verified'}
                </span>
              </p>
            </div>
          )}

          {/* Asymmetric Signature Status */}
          {result.asymmetricValid !== undefined && (
            <div className="rounded-lg border border-border bg-muted p-2 md:p-3">
              <p className="text-xs md:text-sm">
                <span className="font-medium">Asymmetric Signature:</span>{' '}
                <span className={result.asymmetricValid ? 'text-success' : 'text-muted-foreground'}>
                  {result.asymmetricValid ? '✓ Valid' : '○ Not verified'}
                </span>
              </p>
            </div>
          )}

          {/* Recomputed Hash */}
          {result.recomputedHash && (
            <div className="rounded-lg border border-border bg-muted p-2 md:p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Recomputed Hash (SHA256)
              </p>
              <code className="block w-full break-all overflow-x-auto rounded bg-background p-2 font-mono text-xs text-foreground">
                {result.recomputedHash}
              </code>
            </div>
          )}

          {/* Trust Confidence Summary */}
          <div className="rounded-lg border border-border bg-accent p-2 md:p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Trust Assessment
            </p>
            <div className="space-y-1 text-xs leading-relaxed">
              {result.valid ? (
                <p className="text-success">
                  ✓ This decision has passed integrity verification.
                </p>
              ) : (
                <p className="text-destructive">
                  ✗ This decision failed integrity verification.
                </p>
              )}
              {result.hashMatches && (
                <p className="text-muted-foreground">
                  • Input hash matches original (no tampering detected)
                </p>
              )}
              {result.signatureValid && (
                <p className="text-muted-foreground">
                  • HMAC signature verified (backward compatible)
                </p>
              )}
              {result.asymmetricValid && (
                <p className="text-muted-foreground">
                  • Asymmetric signature verified (cryptographically signed)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Note */}
      {!result && (
        <div className="rounded-lg border border-border bg-muted p-2 md:p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Click "Verify Decision Integrity" to cryptographically verify that this decision
            has not been tampered with and was issued by the OpsIQ engine.
          </p>
        </div>
      )}
    </div>
  );
}
