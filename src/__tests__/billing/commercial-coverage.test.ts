/**
 * Commercial coverage governance (static).
 *
 * Every exported route handler under src/app/api must be classified in
 * src/domain/commercial/commercial-route-registry.json, and every classification must be backed by
 * the enforcement it claims. A new owner mutation that is not classified fails this test, so nothing
 * can ship without an explicit free/paid decision.
 *
 * Statically undetectable (documented in docs/opsiq/commercial/PAYWALL_BOUNDARY.md): behaviour that
 * a free route reaches indirectly through a service. Those are covered by service-level gates
 * (diagnosis allowance, scheduled reassessment skip) and by the DB-backed state tests, not by this scan.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMERCIAL_CAPABILITIES, COMMERCIAL_CLASSES } from "@/domain/commercial/commercial-capability";
import registryJson from "@/domain/commercial/commercial-route-registry.json";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getCapabilitiesForRole } from "@/policies/capability-check";

interface Entry { method: string; route: string; classification: string; enforcement: string; capability?: string }
const registry = registryJson as Entry[];
const API_ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

function discover(): Array<{ method: string; route: string; file: string; source: string }> {
  const found: Array<{ method: string; route: string; file: string; source: string }> = [];
  for (const file of walk(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    const route = "/api/" + relative(API_ROOT, file).split(sep).slice(0, -1).join("/");
    for (const m of METHODS) {
      if (new RegExp(`export\\s+(const|async\\s+function|function)\\s+${m}\\b`).test(source)) {
        found.push({ method: m, route: route.replace(/\/$/, ""), file, source });
      }
    }
  }
  return found;
}

/** Text of the withCanonicalEnforcement(...) call for a method, string/comment aware. */
function wrapperCall(source: string, method: string): string | null {
  const m = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*withCanonicalEnforcement\\s*\\(`).exec(source);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (source.startsWith("//", i)) i = source.indexOf("\n", i);
    else if (source.startsWith("/*", i)) i = source.indexOf("*/", i) + 1;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const handlers = discover();
const key = (m: string, r: string) => `${m} ${r}`;

describe("commercial coverage registry", () => {
  it("every exported route handler is classified (no unclassified mutation or read)", () => {
    const known = new Set(registry.map((e) => key(e.method, e.route)));
    const missing = handlers.filter((h) => !known.has(key(h.method, h.route))).map((h) => key(h.method, h.route));
    expect(missing).toEqual([]);
  });

  it("registry has no stale entries for handlers that no longer exist", () => {
    const live = new Set(handlers.map((h) => key(h.method, h.route)));
    const stale = registry.filter((e) => !live.has(key(e.method, e.route))).map((e) => key(e.method, e.route));
    expect(stale).toEqual([]);
  });

  it("every entry uses a known class and has no duplicates", () => {
    const seen = new Set<string>();
    for (const e of registry) {
      expect(COMMERCIAL_CLASSES).toContain(e.classification);
      const k = key(e.method, e.route);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("PAID_CONTINUATION handlers are enforced where the registry says they are", () => {
    const caps = new Set<string>(Object.values(COMMERCIAL_CAPABILITIES));
    const problems: string[] = [];
    for (const e of registry.filter((x) => x.classification === "PAID_CONTINUATION")) {
      const h = handlers.find((x) => x.method === e.method && x.route === e.route);
      if (!h) continue;
      if (e.enforcement === "requireCommercial") {
        const call = wrapperCall(h.source, e.method);
        if (!call || !call.includes(`requireCommercial: "${e.capability}"`) || !caps.has(e.capability ?? "")) {
          problems.push(`${key(e.method, e.route)}: missing requireCommercial ${e.capability}`);
        }
      } else if (e.enforcement === "route:assertCommercialAccess") {
        if (!h.source.includes("assertCommercialAccess(")) problems.push(`${key(e.method, e.route)}: missing assertCommercialAccess`);
      } else if (e.enforcement !== "service:scheduled-reassessment-skip") {
        problems.push(`${key(e.method, e.route)}: PAID_CONTINUATION has unsupported enforcement ${e.enforcement}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("requireCommercial is used only on routes the registry classifies as PAID_CONTINUATION", () => {
    const paid = new Set(registry.filter((e) => e.enforcement === "requireCommercial").map((e) => key(e.method, e.route)));
    const stray = handlers
      .filter((h) => wrapperCall(h.source, h.method)?.includes("requireCommercial"))
      .map((h) => key(h.method, h.route))
      .filter((k) => !paid.has(k));
    expect(stray).toEqual([]);
  });

  it("no handler is left unclassified or pending: zero open bypasses, zero undecided handlers", () => {
    expect(registry.filter((e) => e.classification === "CLASSIFICATION_REQUIRES_DECISION" || e.enforcement === "decision-pending")).toEqual([]);
  });

  it("every enforcement kind in the registry is one this suite knows how to verify", () => {
    const known = new Set([
      "none", "requireCommercial", "route:assertCommercialAccess", "service:diagnosis-allowance",
      "service:scheduled-reassessment-skip", "service:capture-free-reassessment-paid", "handler:assertCommercialCapability", "staff-only-guard",
    ]);
    expect(registry.filter((e) => !known.has(e.enforcement)).map((e) => key(e.method, e.route))).toEqual([]);
  });

  it("handler-level action gates exist where the registry says the paid action is split from free capture", () => {
    for (const e of registry.filter((x) => x.enforcement === "handler:assertCommercialCapability")) {
      const h = handlers.find((x) => x.method === e.method && x.route === e.route)!;
      expect(h.source, key(e.method, e.route)).toContain("assertCommercialCapability(");
      // the free action must NOT be route-gated, or capture would be blocked
      expect(wrapperCall(h.source, e.method) ?? "", key(e.method, e.route)).not.toContain("requireCommercial");
    }
    const spend = readFileSync(join(process.cwd(), "src/services/owner-budget/budget.service.ts"), "utf8");
    const fn = spend.slice(spend.indexOf("export async function recordSpendEntry"));
    expect(fn.indexOf("canPerformCommercialCapability(")).toBeGreaterThan(fn.indexOf("db.spendEntry.create("));
    expect(fn.indexOf("canPerformCommercialCapability(")).toBeLessThan(fn.indexOf("reassessBudget("));
  });

  it("Startup Mode shares the workspace allowance: every qualifying analysis writer is gated in its transaction, capture is not", () => {
    const src = readFileSync(join(process.cwd(), "src/services/owner-strategy/startup-session.service.ts"), "utf8");
    for (const fn of ["screenIdeaRecord", "generateAndPersistHypotheses", "buildAndPersistEconomicModel", "assessAndPersistReadiness", "createSystemRecommendation"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`));
      const tx = body.indexOf("db.$transaction(");
      const gate = body.indexOf("assertDiagnosisAllowance(tx, workspaceId)");
      expect(gate, fn).toBeGreaterThan(tx);
      expect(gate, fn).toBeLessThan(body.indexOf("\nexport ", 10) === -1 ? Infinity : body.indexOf("\nexport ", 10));
    }
    const capture = src.slice(src.indexOf("export async function recordHypothesisResult("));
    expect(capture.slice(0, capture.indexOf("\nexport ", 10))).not.toContain("assertDiagnosisAllowance");
    const analysis = handlers.find((h) => h.route === "/api/owner/startup/sessions/[sessionId]/analysis" && h.method === "POST")!;
    expect(wrapperCall(analysis.source, "POST") ?? "").not.toContain("requireCommercial");
    const policy = readFileSync(join(process.cwd(), "src/services/billing/commercial-policy.service.ts"), "utf8");
    for (const table of ["startup_idea_record", "startup_hypothesis", "startup_economic_model", "startup_readiness_assessment", "startup_system_recommendation"]) {
      expect(policy, table).toContain(table);
    }
  });

  it("staff-only handlers are unreachable by a self-serve owner capability bundle; owner-role expansion fails this test until reclassified", () => {
    const ownerBundle = new Set<string>(getCapabilitiesForRole("admin_or_portfolio_manager" as never, "owner" as never));
    const byName = CAPABILITIES as Record<string, string>;
    const reachable: string[] = [];
    for (const e of registry.filter((x) => x.enforcement === "staff-only-guard")) {
      const h = handlers.find((x) => x.method === e.method && x.route === e.route)!;
      const call = wrapperCall(h.source, e.method);
      expect(call, key(e.method, e.route)).not.toBeNull();
      const required = [...(/requireCapabilities:\s*\[([^\]]*)\]/.exec(call!)?.[1] ?? "").matchAll(/CAPABILITIES\.([A-Z_]+)/g)].map((m) => byName[m[1]]);
      expect(required.length, key(e.method, e.route)).toBeGreaterThan(0);
      if (required.every((c) => ownerBundle.has(c))) reachable.push(key(e.method, e.route));
    }
    expect(reachable).toEqual([]);
  });

  it("diagnosis writers are gated inside the writer transaction", () => {
    const writers: Array<[string, string]> = [
      ["src/services/owner-finance/diagnosis.service.ts", "ownerFinanceCycle"],
      ["src/services/owner-cashflow/diagnosis.service.ts", "ownerCashflowCycle"],
      ["src/services/owner-sales/diagnosis.service.ts", "ownerSalesCycle"],
      ["src/services/owner-operations/diagnosis.service.ts", "ownerOperationsCycle"],
      ["src/services/owner-sop/diagnosis.service.ts", "ownerSopCycle"],
      ["src/services/owner-marketing/diagnosis.service.ts", "ownerMarketingCycle"],
      ["src/services/owner-strategy/diagnosis.service.ts", "ownerStrategyCycle"],
      ["src/services/founder-recovery/cycle.service.ts", "recoveryCycle"],
    ];
    for (const [file, model] of writers) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const gate = src.indexOf("assertDiagnosisAllowance(tx,");
      const create = src.indexOf(`tx.${model}.create(`);
      expect(gate, file).toBeGreaterThan(-1);
      expect(create, file).toBeGreaterThan(gate);
    }
  });

  it("no cycle-table insert exists outside the gated writers", () => {
    const allowed = new Set([
      "src/services/owner-finance/diagnosis.service.ts",
      "src/services/owner-cashflow/diagnosis.service.ts",
      "src/services/owner-sales/diagnosis.service.ts",
      "src/services/owner-operations/diagnosis.service.ts",
      "src/services/owner-sop/diagnosis.service.ts",
      "src/services/owner-marketing/diagnosis.service.ts",
      "src/services/owner-strategy/diagnosis.service.ts",
      "src/services/founder-recovery/cycle.service.ts",
    ]);
    const re = /\.(ownerFinanceCycle|ownerCashflowCycle|ownerSalesCycle|ownerOperationsCycle|ownerSopCycle|ownerMarketingCycle|ownerStrategyCycle|recoveryCycle)\.(create|createMany|upsert)\(/;
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== "generated" && name !== "__tests__") scan(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.|\.db\.test\./.test(name)) continue;
        const rel = relative(process.cwd(), p).split(sep).join("/");
        if (re.test(readFileSync(p, "utf8")) && !allowed.has(rel)) offenders.push(rel);
      }
    };
    scan(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
