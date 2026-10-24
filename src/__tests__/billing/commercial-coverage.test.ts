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
