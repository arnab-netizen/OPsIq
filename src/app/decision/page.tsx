'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DecisionResultComponent } from '@/components/decision/DecisionResult';
import { TrustCard } from '@/components/decision/TrustCard';
import { DecisionResult } from '@/domain/decision/types';
import type { CalibrationMetrics } from '@/services/calibration/engine';

interface FormValues {
  baselineRevenue: string;
  baselineCost: string;
  revenueChange: string;
  costChange: string;
  confidence: string;
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
  const [isApproved, setIsApproved] = useState(false);

  const [calibrationMetrics, setCalibrationMetrics] = useState<CalibrationMetrics | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(true);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCalibration = async () => {
      try {
        setCalibrationLoading(true);
        const response = await fetch('/api/calibration');

        if (!response.ok) {
          setCalibrationError('Unable to load trust metrics');
          return;
        }

        const data = await response.json() as CalibrationMetrics;
        setCalibrationMetrics(data);
        setCalibrationError(null);
      } catch (err) {
        console.error('Failed to fetch calibration metrics:', err);
        setCalibrationError('Failed to load trust metrics');
      } finally {
        setCalibrationLoading(false);
      }
    };

    fetchCalibration();
  }, []);

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
    setIsApproved(false);

    // Validate form values
    const baselineRevenue = parseFloat(formValues.baselineRevenue);
    const baselineCost = parseFloat(formValues.baselineCost);
    const revenueChange = parseFloat(formValues.revenueChange);
    const costChange = parseFloat(formValues.costChange);
    const confidence = parseFloat(formValues.confidence);

    // Validate all fields are present
    if (
      formValues.baselineRevenue.trim() === '' ||
      formValues.baselineCost.trim() === '' ||
      formValues.revenueChange.trim() === '' ||
      formValues.costChange.trim() === '' ||
      formValues.confidence.trim() === ''
    ) {
      setError('All fields are required');
      return;
    }

    // Validate all are valid numbers
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

    setLoading(true);

    try {
      // Prepare request payload per contract: POST /api/run
      const requestPayload = {
        revenue: baselineRevenue,
        cost: baselineCost,
      };

      console.log('Calling /api/run with payload:', requestPayload);

      const response = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const data = await response.json() as DecisionResult;

      if (!response.ok) {
        // API returned error (HTTP 400 or 403)
        // data still contains DecisionResult with reason explaining the block
        const errorMessage =
          data.reason === 'LOW_CONFIDENCE'
            ? 'Decision blocked: Confidence level is too low'
            : data.reason === 'NON_POSITIVE_IMPACT'
              ? 'Decision blocked: Expected impact is not positive'
              : data.reason === 'INVALID_INPUT'
                ? 'Decision blocked: Invalid input parameters'
                : `Decision blocked: ${data.explanation?.summary || 'Unknown error'}`;

        setError(errorMessage);
        // Still store result for transparency (user can see why it was blocked)
        setResult(data);
        setIsApproved(false);
        setLoading(false);
        return;
      }

      // Success: HTTP 200
      console.log('Decision API response:', data);
      setResult(data);
      setError(null);
      // Set approved if decision was APPROVED
      setIsApproved(data.decision === 'APPROVED');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get decision';
      console.error('Decision API error:', err);
      setError(`Network error: ${errorMessage}`);
      setResult(null);
      setIsApproved(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 md:p-8 sm:p-4">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-foreground md:text-4xl">
            OPSIQ Decision Check
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Enter current business numbers to generate a traceable decision.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Error Message */}
          {error && (
            <div className="sticky top-0 z-50 rounded-lg border border-destructive bg-destructive/5 p-3 md:p-4 md:relative md:z-auto">
              <p className="text-xs md:text-sm font-medium text-destructive">{error}</p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-3 md:space-y-4">
            {/* Baseline Revenue */}
            <div>
              <label
                htmlFor="baselineRevenue"
                className="block text-xs md:text-sm font-medium text-foreground"
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 md:px-4 py-2.5 md:py-2 text-base md:text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Baseline Cost */}
            <div>
              <label
                htmlFor="baselineCost"
                className="block text-xs md:text-sm font-medium text-foreground"
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 md:px-4 py-2.5 md:py-2 text-base md:text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Revenue Change */}
            <div>
              <label
                htmlFor="revenueChange"
                className="block text-xs md:text-sm font-medium text-foreground"
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 md:px-4 py-2.5 md:py-2 text-base md:text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Cost Change */}
            <div>
              <label
                htmlFor="costChange"
                className="block text-xs md:text-sm font-medium text-foreground"
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 md:px-4 py-2.5 md:py-2 text-base md:text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>

            {/* Confidence */}
            <div>
              <label
                htmlFor="confidence"
                className="block text-xs md:text-sm font-medium text-foreground"
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 md:px-4 py-2.5 md:py-2 text-base md:text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            className="w-full rounded-lg bg-primary px-4 py-3 md:py-3 py-3.5 font-medium text-sm md:text-base text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {loading ? 'Running Decision...' : 'Run Decision'}
          </button>
        </form>

        {/* Success Banner */}
        {isApproved && result && (
          <div className="rounded-lg border border-success bg-success/5 p-4 md:p-6 mb-6 md:mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-base md:text-lg font-semibold text-success mb-1">
                  ✓ Decision Approved
                </h2>
                <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
                  This action has been added to My Day and will appear in your
                  priority queue.
                </p>
                <Link
                  href="/my-day"
                  className="inline-block rounded-lg bg-success px-4 py-2 text-xs md:text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Go to My Day →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className={isApproved ? 'mt-4 md:mt-6' : 'mt-6 md:mt-8'}>
            <DecisionResultComponent result={result} />
          </div>
        )}

        {/* Trust Card - System Calibration Metrics */}
        <TrustCard
          metrics={calibrationMetrics}
          loading={calibrationLoading}
          error={calibrationError}
        />

        {/* Info Section */}
        <div className="mt-6 md:mt-8 rounded-lg border border-border bg-muted p-3 md:p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium">Note:</span> All decisions are logged
            and verified with cryptographic signatures for audit compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
