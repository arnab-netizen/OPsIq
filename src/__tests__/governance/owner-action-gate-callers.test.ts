/**
 * Governance: every caller of the owner action gate carries the action's SEMANTIC INTENT, and records the
 * gate's Owner-mode assessment only after its own mutation is saved.
 *
 * The gate (owner-action-gate.service.ts → owner-action-gate-policy.ts) applies its growth limits by
 * intent: protective work (SAFETY / STABILISE / REPAIR / EVIDENCE) is never held back by the danger it
 * responds to. An action that reaches the gate with neither a finding code (from which the intent is
 * derived — ownerFindingIntent) nor an explicit intent silently falls back to its domain's sensitivity:
 * e.g. Budget's "Protect cash: freeze discretionary spend" was refused at CRITICAL cash as a spend action.
 *
 * Every non-test source file that calls `enforceOwnerActionGates(` is enumerated here (a new caller fails
 * until it is listed with how it supplies intent). Each call's argument object must name `findingCode:` or
 * `intent:`; each caller must record the assessment (recordOwnerGateAssessment) AFTER its update write.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { budgetActionIntent, BUDGET_MARGIN_REPAIR_TITLES } from "@/domain/owner-budget";
import { recoveryActionFindingCode } from "@/services/owner-home/owner-decision-candidates";
import { hasExplicitOwnerIntent } from "@/domain/owner-spine/owner-imperatives";
import { PROTECTIVE_INTENTS } from "@/domain/owner-mode/owner-action-gate-policy";
import type { PlanDecisionType } from "@/domain/owner-budget/types";

const ROOT = process.cwd();

/** Caller → how it supplies the action's intent. */
const CALLERS: Readonly<Record<string, "findingCode" | "intent">> = {
  "src/services/owner-finance/action.service.ts": "findingCode",
  "src/services/owner-cashflow/action.service.ts": "findingCode",
  "src/services/owner-sales/action.service.ts": "findingCode",
  "src/services/owner-marketing/action.service.ts": "findingCode",
  "src/services/owner-operations/action.service.ts": "findingCode",
  "src/services/owner-sop/action.service.ts": "findingCode",
  // Strategy: its step's class under the live decision (and its code).
  "src/services/owner-strategy/action.service.ts": "intent",
  // Recovery: its linked finding's code (recoveryActionFindingCode — the same code the owner decision uses).
  "src/services/founder-recovery/action.service.ts": "findingCode",
  // Budget: its plan decision type (budgetActionIntent).
  "src/services/owner-budget/action-link.service.ts": "intent",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "__tests__" || name === "generated" || name === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

const CALL = /\benforceOwnerActionGates\s*\(/g;
const GATE_SERVICE = "src/services/owner-mode/owner-action-gate.service.ts";

describe("every owner action-gate caller carries the action's intent", () => {
  const files = sourceFiles(join(ROOT, "src")).filter((f) => rel(f) !== GATE_SERVICE);
  const callers = files.filter((f) => /\benforceOwnerActionGates\s*\(/.test(stripComments(readFileSync(f, "utf8"))));

  it("the callers are exactly the enumerated action services", () => {
    expect(callers.map(rel).sort()).toEqual(Object.keys(CALLERS).sort());
  });

  it("each call names findingCode or an explicit intent (never neither)", () => {
    for (const f of callers) {
      const src = stripComments(readFileSync(f, "utf8"));
      CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      let calls = 0;
      while ((m = CALL.exec(src))) {
        calls++;
        const args = callArgs(src, m.index + m[0].length - 1);
        const how = CALLERS[rel(f)];
        expect(new RegExp(`\\b${how}\\s*:`).test(args), `${rel(f)} passes ${how}`).toBe(true);
        expect(/\bfindingCode\s*:\s*(?:null|undefined)\b|\bintent\s*:\s*(?:null|undefined)\b/.test(args), rel(f)).toBe(false);
      }
      expect(calls, rel(f)).toBeGreaterThan(0);
    }
  });

  it("the gate is never reached through an alias or a renamed import (every call is visible to these checks)", () => {
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      expect(/\benforceOwnerActionGates\s+as\s+\w|=\s*enforceOwnerActionGates\b(?!\s*\()|\[\s*["'`]enforceOwnerActionGates["'`]\s*\]/.test(src), rel(f)).toBe(false);
    }
  });

  it("at EVERY call, the caller records the gate's assessment only after its (compare-and-set) update is written", () => {
    const WRITE = /\.\s*update(?:Many)?\s*\(|\bapplyGuardedActionUpdate\s*(?:<[^>]*>)?\s*\(/;
    for (const f of callers) {
      const src = stripComments(readFileSync(f, "utf8"));
      CALL.lastIndex = 0;
      let m: RegExpExecArray | null;
      let calls = 0;
      while ((m = CALL.exec(src))) {
        calls++;
        const after = src.slice(m.index);
        const write = after.search(WRITE);
        const record = after.search(/\brecordOwnerGateAssessment\s*\(/);
        expect(write, `${rel(f)} writes after the gate (call ${calls})`).toBeGreaterThan(0);
        expect(record, `${rel(f)} records the assessment after the write (call ${calls})`).toBeGreaterThan(write);
      }
      expect(calls, rel(f)).toBeGreaterThan(0);
    }
  });

  it("Budget: every plan decision type has an intent by PURPOSE; withholding and evidence work is protective; a margin repair is REPAIR", () => {
    const all: PlanDecisionType[] = ["APPROVE", "BLOCK", "PAUSE", "REDUCE", "INCREASE", "REALLOCATE", "INVESTIGATE", "DEFER", "ESCALATE", "COLLECT_EVIDENCE"];
    for (const d of all) expect(budgetActionIntent({ decisionType: d }), d).not.toBeNull();
    for (const d of ["BLOCK", "PAUSE", "DEFER", "REDUCE", "INVESTIGATE", "COLLECT_EVIDENCE", "ESCALATE"] as const) {
      expect(PROTECTIVE_INTENTS.has(budgetActionIntent({ decisionType: d })!), d).toBe(true);
    }
    for (const d of ["APPROVE", "INCREASE", "REALLOCATE"] as const) expect(budgetActionIntent({ decisionType: d })).toBe("GROW");
    // Repricing an underpriced contract is an INCREASE whose purpose is repairing margin — never growth.
    for (const title of Object.values(BUDGET_MARGIN_REPAIR_TITLES)) expect(budgetActionIntent({ decisionType: "INCREASE", title }), title).toBe("REPAIR");
    // The documented legacy fallback: an unknown decision type → no intent (the domain's sensitivity applies).
    expect(budgetActionIntent({ decisionType: "LEGACY_TYPE" })).toBeNull();
  });

  it("Budget: the action-link caller passes the action's own title with its decision type (purpose, not type alone)", () => {
    const src = stripComments(readFileSync(join(ROOT, "src/services/owner-budget/action-link.service.ts"), "utf8"));
    expect(src).toMatch(/budgetActionIntent\(\s*\{\s*decisionType:\s*action\.decisionType,\s*title:\s*action\.title\s*\}\s*\)/);
  });

  it("Recovery: a linked finding's code is used, and every Recovery diagnosis code is explicitly classified", () => {
    expect(recoveryActionFindingCode({ finding: { code: "RECEIVABLES_PRESSURE" }, metricToMove: "x" })).toBe("RECEIVABLES_PRESSURE");
    const diagnosis = readFileSync(join(ROOT, "src/domain/founder-recovery/diagnosis.ts"), "utf8");
    const codes = [...diagnosis.matchAll(/\bcode\s*:\s*"([A-Z][A-Z0-9_]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(5);
    expect(codes.filter((c) => !hasExplicitOwnerIntent(c))).toEqual([]);
  });
});
