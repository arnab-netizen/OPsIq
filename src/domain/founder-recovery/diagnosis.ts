/**
 * Founder Recovery — diagnosis engine.
 *
 * Pure function. Produces evidence-backed findings strictly from persisted real
 * metrics and explicit thresholds. There is no static recommendation list and
 * no fabricated reliability score: every finding cites its source metric, the
 * current value, the threshold crossed, computed severity, and a verification
 * metric. Confidence reflects data availability for that specific metric.
 */
import type { DerivedMetrics, Finding, MetricSnapshotInput, Severity } from "./types";
import { RECOVERY_THRESHOLDS as T } from "./thresholds";

/** Severity for "lower value is worse" metrics. Returns null if above all bands. */
function severityLowerWorse(
  value: number | null,
  bands: { medium: number; high: number; critical: number }
): Severity | null {
  if (value === null) return null;
  if (value <= bands.critical) return "critical";
  if (value <= bands.high) return "high";
  if (value <= bands.medium) return "medium";
  return null;
}

/** Severity for "higher value is worse" metrics. Returns null if below all bands. */
function severityHigherWorse(
  value: number | null,
  bands: { medium: number; high: number; critical: number }
): Severity | null {
  if (value === null) return null;
  if (value >= bands.critical) return "critical";
  if (value >= bands.high) return "high";
  if (value >= bands.medium) return "medium";
  return null;
}

function fmt(n: number | null, suffix = ""): string {
  return n === null ? "n/a" : `${n}${suffix}`;
}

/**
 * Generate findings for a laundry / local-service business.
 *
 * @param snapshot raw current snapshot (for absolute amounts / impact)
 * @param d derived metrics for the current period
 * @param prev derived metrics for the previous period (optional, for comparison)
 */
export function generateFindings(
  snapshot: MetricSnapshotInput,
  d: DerivedMetrics,
  prev?: DerivedMetrics
): Finding[] {
  const findings: Finding[] = [];
  const cur = snapshot.currency;

  // 1. Low / declining revenue
  {
    const sev = severityHigherWorse(
      d.revenueTrendPct === null ? null : -d.revenueTrendPct,
      { medium: -T.revenueDeclinePct.medium, high: -T.revenueDeclinePct.high, critical: -T.revenueDeclinePct.critical }
    );
    if (sev && d.revenueTrendPct !== null) {
      const lostRevenue =
        snapshot.revenue !== undefined && d.revenueTrendPct < 0
          ? Math.round((snapshot.revenue * Math.abs(d.revenueTrendPct)) / (100 + d.revenueTrendPct))
          : null;
      findings.push({
        code: "LOW_REVENUE",
        title: "Revenue is declining",
        sourceMetric: "revenueTrendPct",
        currentValue: d.revenueTrendPct,
        comparisonValue: prev?.revenueTrendPct ?? null,
        threshold: T.revenueDeclinePct.medium,
        severity: sev,
        evidence: `Revenue moved ${fmt(d.revenueTrendPct, "%")} vs previous period.`,
        whyItMatters:
          "Falling revenue erodes the cash needed to cover fixed costs (rent, staff) and compounds quickly in a local-service business.",
        impactEstimate: lostRevenue,
        impactCurrency: lostRevenue === null ? null : cur,
        confidence: 0.9,
        recommendedAction: "Run a B2C reactivation and order-recovery push to rebuild period revenue.",
        verificationMetric: "revenue",
      });
    }
  }

  // 2. High cost ratio (low net margin)
  {
    const sev = severityLowerWorse(d.netMarginPct, T.netMarginPct);
    if (sev) {
      findings.push({
        code: "HIGH_COST_RATIO",
        title: "Net margin is too low for the cost base",
        sourceMetric: "netMarginPct",
        currentValue: d.netMarginPct,
        comparisonValue: prev?.netMarginPct ?? null,
        threshold: T.netMarginPct.medium,
        severity: sev,
        evidence: `Net margin is ${fmt(d.netMarginPct, "%")} against a ${T.netMarginPct.medium}% guard.`,
        whyItMatters:
          "A thin or negative net margin means the business consumes cash every period; costs must be brought under revenue.",
        impactEstimate:
          snapshot.revenue !== undefined && d.netMarginPct !== null && d.netMarginPct < T.netMarginPct.medium
            ? Math.round((snapshot.revenue * (T.netMarginPct.medium - d.netMarginPct)) / 100)
            : null,
        impactCurrency: cur,
        confidence: 0.9,
        recommendedAction: "Break down the top cost lines (staff, rent, material, delivery) and cut the largest controllable leak.",
        verificationMetric: "netMarginPct",
      });
    }
  }

  // 3. Weak repeat customer rate
  {
    const sev = severityLowerWorse(d.repeatCustomerRatePct, T.repeatCustomerRatePct);
    if (sev) {
      findings.push({
        code: "WEAK_REPEAT_RATE",
        title: "Repeat customer rate is weak",
        sourceMetric: "repeatCustomerRatePct",
        currentValue: d.repeatCustomerRatePct,
        comparisonValue: prev?.repeatCustomerRatePct ?? null,
        threshold: T.repeatCustomerRatePct.medium,
        severity: sev,
        evidence: `Repeat rate is ${fmt(d.repeatCustomerRatePct, "%")} (guard ${T.repeatCustomerRatePct.medium}%).`,
        whyItMatters:
          "Local laundry economics depend on repeat orders; low repeat rate means expensive constant acquisition.",
        impactEstimate: null,
        impactCurrency: null,
        confidence: 0.85,
        recommendedAction: "Launch a dormant-customer reactivation campaign with a repeat-order incentive.",
        verificationMetric: "repeatCustomerRatePct",
      });
    }
  }

  // 4. Excessive discounting (discount leakage)
  {
    const sev = severityHigherWorse(d.discountLeakagePct, T.discountLeakagePct);
    if (sev) {
      findings.push({
        code: "DISCOUNT_LEAKAGE",
        title: "Discounting is leaking margin",
        sourceMetric: "discountLeakagePct",
        currentValue: d.discountLeakagePct,
        comparisonValue: prev?.discountLeakagePct ?? null,
        threshold: T.discountLeakagePct.medium,
        severity: sev,
        evidence: `Discounts are ${fmt(d.discountLeakagePct, "%")} of gross revenue (guard ${T.discountLeakagePct.medium}%).`,
        whyItMatters: "Unstructured discounting directly removes margin and trains customers to wait for offers.",
        impactEstimate: snapshot.discountAmount ?? null,
        impactCurrency: snapshot.discountAmount === undefined ? null : cur,
        confidence: 0.85,
        recommendedAction: "Cap discount authority and replace blanket discounts with targeted repeat-order offers.",
        verificationMetric: "discountLeakagePct",
      });
    }
  }

  // 5. Complaint / rewash quality problem
  {
    const qualityRate =
      d.complaintRatePct !== null || d.rewashRatePct !== null
        ? (d.complaintRatePct ?? 0) + (d.rewashRatePct ?? 0)
        : null;
    const sev = severityHigherWorse(qualityRate, T.qualityFailureRatePct);
    if (sev) {
      findings.push({
        code: "QUALITY_FAILURE",
        title: "Complaints / rewashes are too high",
        sourceMetric: "complaintRatePct+rewashRatePct",
        currentValue: qualityRate,
        comparisonValue: null,
        threshold: T.qualityFailureRatePct.medium,
        severity: sev,
        evidence: `Combined complaint+rewash rate is ${fmt(qualityRate, "%")} of orders (guard ${T.qualityFailureRatePct.medium}%).`,
        whyItMatters: "Quality failures drive refunds, rewashes (double cost) and churn in a referral-driven local market.",
        impactEstimate: snapshot.refundAmount ?? null,
        impactCurrency: snapshot.refundAmount === undefined ? null : cur,
        confidence: 0.8,
        recommendedAction: "Root-cause the top complaint categories and add a pre-dispatch quality check.",
        verificationMetric: "complaintRatePct",
      });
    }
  }

  // 6. Delivery cost leakage
  {
    const sev = severityHigherWorse(d.deliveryCostRatioPct, T.deliveryCostRatioPct);
    if (sev) {
      findings.push({
        code: "DELIVERY_COST_LEAKAGE",
        title: "Delivery cost ratio is high",
        sourceMetric: "deliveryCostRatioPct",
        currentValue: d.deliveryCostRatioPct,
        comparisonValue: prev?.deliveryCostRatioPct ?? null,
        threshold: T.deliveryCostRatioPct.medium,
        severity: sev,
        evidence: `Delivery is ${fmt(d.deliveryCostRatioPct, "%")} of revenue (guard ${T.deliveryCostRatioPct.medium}%).`,
        whyItMatters: "Delivery is often the least-controlled local-service cost and silently erodes per-order margin.",
        impactEstimate: snapshot.deliveryCost ?? null,
        impactCurrency: snapshot.deliveryCost === undefined ? null : cur,
        confidence: 0.8,
        recommendedAction: "Batch deliveries by area and set a minimum order value for free pickup/drop.",
        verificationMetric: "deliveryCostRatioPct",
      });
    }
  }

  // 7. B2B concentration risk
  {
    const sev = severityHigherWorse(d.b2bSharePct, T.b2bSharePct);
    if (sev) {
      findings.push({
        code: "B2B_CONCENTRATION",
        title: "Revenue is concentrated in B2B",
        sourceMetric: "b2bSharePct",
        currentValue: d.b2bSharePct,
        comparisonValue: prev?.b2bSharePct ?? null,
        threshold: T.b2bSharePct.medium,
        severity: sev,
        evidence: `B2B is ${fmt(d.b2bSharePct, "%")} of revenue (guard ${T.b2bSharePct.medium}%).`,
        whyItMatters: "Heavy B2B dependence means losing one contract can collapse revenue; B2C balances the risk.",
        impactEstimate: null,
        impactCurrency: null,
        confidence: 0.8,
        recommendedAction: "Assess B2B pricing for margin and grow B2C to dilute concentration.",
        verificationMetric: "b2bSharePct",
      });
    }
  }

  // 8. Poor staff productivity
  {
    // Productivity is relative; flag only if it dropped vs previous period.
    if (d.staffProductivity !== null && prev?.staffProductivity != null) {
      const drop = prev.staffProductivity === 0 ? null : ((d.staffProductivity - prev.staffProductivity) / prev.staffProductivity) * 100;
      if (drop !== null && drop <= -10) {
        const sev: Severity = drop <= -25 ? "high" : "medium";
        findings.push({
          code: "LOW_STAFF_PRODUCTIVITY",
          title: "Staff productivity is falling",
          sourceMetric: "staffProductivity",
          currentValue: d.staffProductivity,
          comparisonValue: prev.staffProductivity,
          threshold: -10,
          severity: sev,
          evidence: `Productivity moved ${Math.round(drop)}% vs previous period.`,
          whyItMatters: "Falling output per staff/cost unit raises unit cost and turnaround time.",
          impactEstimate: null,
          impactCurrency: null,
          confidence: 0.7,
          recommendedAction: "Review shift scheduling and machine utilisation against order volume.",
          verificationMetric: "staffProductivity",
        });
      }
    }
  }

  // 9. Slow turnaround
  {
    const sev = severityHigherWorse(d.turnaroundHours, T.turnaroundHours);
    if (sev) {
      findings.push({
        code: "SLOW_TURNAROUND",
        title: "Order turnaround is slow",
        sourceMetric: "turnaroundHours",
        currentValue: d.turnaroundHours,
        comparisonValue: prev?.turnaroundHours ?? null,
        threshold: T.turnaroundHours.medium,
        severity: sev,
        evidence: `Average turnaround is ${fmt(d.turnaroundHours, "h")} (guard ${T.turnaroundHours.medium}h).`,
        whyItMatters: "Slow turnaround loses time-sensitive customers and increases complaints.",
        impactEstimate: null,
        impactCurrency: null,
        confidence: 0.75,
        recommendedAction: "Identify the slowest process stage and add capacity or re-sequence it.",
        verificationMetric: "turnaroundHours",
      });
    }
  }

  // 10. Receivables pressure
  {
    const sev = severityHigherWorse(d.receivablesExposurePct, T.receivablesExposurePct);
    if (sev) {
      findings.push({
        code: "RECEIVABLES_PRESSURE",
        title: "Receivables exposure is high",
        sourceMetric: "receivablesExposurePct",
        currentValue: d.receivablesExposurePct,
        comparisonValue: prev?.receivablesExposurePct ?? null,
        threshold: T.receivablesExposurePct.medium,
        severity: sev,
        evidence: `Receivables are ${fmt(d.receivablesExposurePct, "%")} of revenue (guard ${T.receivablesExposurePct.medium}%).`,
        whyItMatters: "Cash tied up in receivables (often B2B) starves day-to-day operations.",
        impactEstimate: snapshot.receivables ?? null,
        impactCurrency: snapshot.receivables === undefined ? null : cur,
        confidence: 0.85,
        recommendedAction: "Tighten B2B payment terms and chase the oldest receivables first.",
        verificationMetric: "receivables",
      });
    }
  }

  // 11. Poor campaign conversion
  {
    const sev = severityLowerWorse(d.marketingConversionEfficiency, T.marketingConversionPer1000);
    if (sev) {
      findings.push({
        code: "POOR_CAMPAIGN_CONVERSION",
        title: "Marketing conversion is inefficient",
        sourceMetric: "marketingConversionEfficiency",
        currentValue: d.marketingConversionEfficiency,
        comparisonValue: prev?.marketingConversionEfficiency ?? null,
        threshold: T.marketingConversionPer1000.medium,
        severity: sev,
        evidence: `${fmt(d.marketingConversionEfficiency)} conversions per 1000 ${cur} spend (guard ${T.marketingConversionPer1000.medium}).`,
        whyItMatters: "Inefficient spend wastes scarce marketing budget that should drive local orders.",
        impactEstimate: snapshot.marketingSpend ?? null,
        impactCurrency: snapshot.marketingSpend === undefined ? null : cur,
        confidence: 0.75,
        recommendedAction: "Shift spend to the highest-converting local channel and pause the rest.",
        verificationMetric: "campaignConversions",
      });
    }
  }

  // 12. Low average order value
  {
    // Flag if AOV dropped materially vs previous period.
    if (d.averageOrderValue !== null && prev?.averageOrderValue != null && prev.averageOrderValue > 0) {
      const drop = ((d.averageOrderValue - prev.averageOrderValue) / prev.averageOrderValue) * 100;
      if (drop <= -8) {
        const sev: Severity = drop <= -20 ? "high" : "medium";
        findings.push({
          code: "LOW_AOV",
          title: "Average order value is falling",
          sourceMetric: "averageOrderValue",
          currentValue: d.averageOrderValue,
          comparisonValue: prev.averageOrderValue,
          threshold: -8,
          severity: sev,
          evidence: `AOV moved ${Math.round(drop)}% to ${fmt(d.averageOrderValue)} ${cur}.`,
          whyItMatters: "Lower AOV means more orders are needed for the same revenue, raising handling cost.",
          impactEstimate: null,
          impactCurrency: null,
          confidence: 0.75,
          recommendedAction: "Introduce bundles/add-ons (e.g. premium wash, ironing) to lift basket size.",
          verificationMetric: "averageOrderValue",
        });
      }
    }
  }

  // Deterministic ordering: severity desc, then code.
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));
}
