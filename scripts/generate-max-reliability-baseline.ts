/**
 * Generate OPSIQ_MAX_RELIABILITY_BASELINE.json — the before-fix reliability snapshot for the maximum-
 * reliability hardening pass. Runs the REAL production-runtime sweep (`scorePublicCorpus`) and the domain
 * matrix, and records every segment (domain, critical domain, category, severity, stage, location,
 * collective decision type) plus the global metrics and corpus volumes. Weak/near-threshold segments are
 * recorded explicitly so they can never be hidden behind an average.
 *
 * Run: npx tsx scripts/generate-max-reliability-baseline.ts [stride]
 * History is preserved: an existing baseline is copied to OPSIQ_MAX_RELIABILITY_BASELINE.<prevCapturedAt>.json
 * before overwrite (never silently destroyed).
 */
import { writeFileSync, existsSync, readFileSync, copyFileSync } from "fs";
import { scorePublicCorpus } from "../src/behavioral-validation/public-cases/public-runner";
import { PUBLIC_CORPUS } from "../src/behavioral-validation/public-cases/library";
import { REQUIRED_DOMAINS, CRITICAL_DOMAIN_SET } from "../src/behavioral-validation/public-cases/domains";

const OUT = "OPSIQ_MAX_RELIABILITY_BASELINE.json";

function nearThreshold(byDomain: Record<string, number>, floor: number, band: number): string[] {
  return Object.entries(byDomain).filter(([, v]) => v >= floor && v < floor + band).map(([k]) => k);
}

async function main() {
  const stride = Number(process.argv[2] ?? 2);
  const capturedAt = process.env.BASELINE_CAPTURED_AT ?? "unset"; // injected (no Date.now in lib layer)
  const report = await scorePublicCorpus({ stride });

  const real = PUBLIC_CORPUS.filter((p) => p.meta.realFlag === "real").length;
  const variants = PUBLIC_CORPUS.filter((p) => p.meta.realFlag === "variant").length;
  const adversarial = PUBLIC_CORPUS.filter((p) => p.meta.split === "adversarial").length;

  const baseline = {
    capturedAt,
    stride,
    corpus: { total: PUBLIC_CORPUS.length, real, variants, adversarial },
    global: {
      productionRuntimeScore: report.productionRuntimeScore,
      collectiveWholeBusinessScore: report.collectiveWholeBusinessScore,
      holdoutScore: report.holdoutScore,
      adversarialUnsafe: report.adversarialUnsafe,
      regressionFailures: report.regressionFailures,
      learningAppliedRate: report.learningAppliedRate,
    },
    segments: {
      byDomain: report.byDomain,
      byCriticalDomain: Object.fromEntries(Object.entries(report.byDomain).filter(([k]) => CRITICAL_DOMAIN_SET.has(k))),
      byCategory: report.byCategory,
      bySeverity: report.bySeverity,
      byStage: report.byStage,
      byLocation: report.byLocation,
      byCollectiveType: report.byCollectiveType,
    },
    weak: {
      domains: report.weakDomains,
      criticalDomains: report.weakCriticalDomains,
      categories: report.weakCategories,
      severities: report.weakSeverities,
      stages: report.weakStages,
      locations: report.weakLocations,
      collectiveTypes: report.weakCollectiveTypes,
    },
    nearThreshold: {
      // <95 domains are flagged for the assurance scorecard (the prompt's near-threshold warning band).
      domainsUnder95: Object.entries(report.byDomain).filter(([, v]) => v < 95).map(([k, v]) => ({ domain: k, score: v })),
      domains90to92: nearThreshold(report.byDomain, 90, 2),
    },
    coverage: {
      requiredDomains: REQUIRED_DOMAINS.length,
      domainsScored: Object.keys(report.byDomain).length,
      collectiveTypesScored: Object.keys(report.byCollectiveType).length,
    },
  };

  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, "utf8")) as { capturedAt?: string };
      copyFileSync(OUT, `OPSIQ_MAX_RELIABILITY_BASELINE.${prev.capturedAt ?? "prev"}.json`);
    } catch { /* keep going — a corrupt prior file must not block a fresh baseline */ }
  }
  writeFileSync(OUT, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`[baseline] wrote ${OUT} (stride ${stride}) — runtime ${report.productionRuntimeScore}, collective ${report.collectiveWholeBusinessScore}, holdout ${report.holdoutScore}`);
  console.log(`[baseline] weak: domains=${report.weakDomains.length} critical=${report.weakCriticalDomains.length} cat=${report.weakCategories.length} sev=${report.weakSeverities.length} stage=${report.weakStages.length} loc=${report.weakLocations.length} collType=${report.weakCollectiveTypes.length}`);
  console.log(`[baseline] near-threshold (<95) domains: ${baseline.nearThreshold.domainsUnder95.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
