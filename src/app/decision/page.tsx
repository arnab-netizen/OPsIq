'use client';

import { useState } from 'react';

interface FormValues {
  baselineRevenue: string;
  baselineCost: string;
  revenueChange: string;
  costChange: string;
  confidence: string;
}

interface DecisionResult {
  decision: 'APPROVED' | 'BLOCKED';
  expectedImpact: number;
  confidence: number;
}

export default function DecisionPage() {
  const [formValues, setFormValues] = useState<FormValues>({
    baselineRevenue: '',
    baselineCost: '',
    revenueChange: '',
    costChange: '',
    confidence: '0.75',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);

  const handleInputChange = (field: keyof FormValues) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Clear previous state
    setError(null);
    setResult(null);

    // Validate form values
    const baselineRevenue = parseFloat(formValues.baselineRevenue);
    const baselineCost = parseFloat(formValues.baselineCost);
    const revenueChange = parseFloat(formValues.revenueChange);
    const costChange = parseFloat(formValues.costChange);
    const confidence = parseFloat(formValues.confidence);

    if (
      isNaN(baselineRevenue) ||
      isNaN(baselineCost) ||
      isNaN(revenueChange) ||
      isNaN(costChange) ||
      isNaN(confidence)
    ) {
      setError('All fields must be valid numbers');
      return;
    }

    if (confidence < 0 || confidence > 1) {
      setError('Confidence must be between 0 and 1');
      return;
    }

    // Log form values to console
    console.log('Decision Form Submitted:', {
      baselineRevenue,
      baselineCost,
      revenueChange,
      costChange,
      confidence,
      timestamp: new Date().toISOString(),
    });

    // TODO: Call /api/run endpoint once ready
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            OPSIQ Decision Check
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Enter current business numbers to generate a traceable decision.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Baseline Revenue */}
            <div>
              <label
                htmlFor="baselineRevenue"
                className="block text-sm font-medium text-foreground"
              >
                Baseline Revenue
              </label>
              <input
                type="number"
                id="baselineRevenue"
                name="baselineRevenue"
                value={formValues.baselineRevenue}
                onChange={handleInputChange('baselineRevenue')}
                placeholder="100000"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Baseline Cost */}
            <div>
              <label
                htmlFor="baselineCost"
                className="block text-sm font-medium text-foreground"
              >
                Baseline Cost
              </label>
              <input
                type="number"
                id="baselineCost"
                name="baselineCost"
                value={formValues.baselineCost}
                onChange={handleInputChange('baselineCost')}
                placeholder="50000"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Revenue Change */}
            <div>
              <label
                htmlFor="revenueChange"
                className="block text-sm font-medium text-foreground"
              >
                Revenue Change
              </label>
              <input
                type="number"
                id="revenueChange"
                name="revenueChange"
                value={formValues.revenueChange}
                onChange={handleInputChange('revenueChange')}
                placeholder="10000"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Cost Change */}
            <div>
              <label
                htmlFor="costChange"
                className="block text-sm font-medium text-foreground"
              >
                Cost Change
              </label>
              <input
                type="number"
                id="costChange"
                name="costChange"
                value={formValues.costChange}
                onChange={handleInputChange('costChange')}
                placeholder="2500"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Confidence */}
            <div>
              <label
                htmlFor="confidence"
                className="block text-sm font-medium text-foreground"
              >
                Confidence (0 - 1)
              </label>
              <input
                type="number"
                id="confidence"
                name="confidence"
                value={formValues.confidence}
                onChange={handleInputChange('confidence')}
                min="0"
                max="1"
                step="0.01"
                placeholder="0.75"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Enter a value between 0 (no confidence) and 1 (full confidence)
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Running Decision...' : 'Run Decision'}
          </button>
        </form>

        {/* Result Display Placeholder */}
        {result && (
          <div className="mt-8 rounded-lg border border-border bg-accent p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Decision Result
            </h2>
            <div className="space-y-2">
              <p>
                <span className="font-medium">Decision:</span>{' '}
                <span
                  className={
                    result.decision === 'APPROVED'
                      ? 'text-success'
                      : 'text-destructive'
                  }
                >
                  {result.decision}
                </span>
              </p>
              <p>
                <span className="font-medium">Expected Impact:</span> $
                {result.expectedImpact.toFixed(2)}
              </p>
              <p>
                <span className="font-medium">Confidence:</span>{' '}
                {(result.confidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 rounded-lg border border-border bg-muted p-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Note:</span> All decisions are logged
            and verified with cryptographic signatures for audit compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
