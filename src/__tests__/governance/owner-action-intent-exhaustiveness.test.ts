/**
 * Governance: every finding code that can reach the owner action gate has an EXPLICIT intent.
 *
 * The action gate (src/services/owner-mode/owner-action-gate.service.ts) applies its growth limits
 * (capacity, cash, margin) by the action's intent: SAFETY / STABILISE / REPAIR / EVIDENCE steps respond
 * to a danger and are never held back by it; GROW (and EXECUTE) steps are. An action's intent comes from
 * its finding code (Strategy: its step's class under the live decision). A code without an explicit
 * classification would silently take classifyOwnerFindingCode's fallback — so a new code fails here until
 * it is classified (OWNER_PRIORITY_CLASS_BY_CODE in owner-decision.ts, or INTENT_BY_CODE in
 * owner-imperatives.ts).
 *
 * The codes are read from where each domain produces its findings and action steps: the risk and
 * opportunity rules, the diagnosis (data-gap findings), and Strategy's decision steps.
 *
 * Documented fallback for a truly unknown legacy code (an action row whose code is no longer produced):
 * classifyOwnerFindingCode → GROWTH_OPPORTUNITY → GROW, the most conservative intent for these limits
 * (the step is held back while capacity, cash or margin is unsafe). An action with no code at all keeps its
 * domain's sensitivity.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { hasExplicitOwnerIntent, ownerFindingIntent, ownerStrategyStepIntent, OWNER_TARGET_INTENTS } from "@/domain/owner-spine/owner-imperatives";

const ROOT = process.cwd();
const DOMAINS = ["finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"] as const;
/** Files that produce finding codes / action step codes. */
const PRODUCERS = ["risk-rules.ts", "opportunity-rules.ts", "diagnosis.ts", "decision.ts", "recommendations.ts", "actions.ts"];

function producedCodes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of DOMAINS) {
    const dir = join(ROOT, "src/domain", `owner-${d}`);
    for (const file of readdirSync(dir)) {
      if (!PRODUCERS.includes(file)) continue;
      const src = readFileSync(join(dir, file), "utf8");
      // A finding's `code` in rule/diagnosis files; an action step's `findingCode` anywhere.
      const patterns = file === "decision.ts" ? [/\bfindingCode\s*:\s*"([A-Z][A-Z0-9_]+)"/g] : [/\bcode\s*:\s*"([A-Z][A-Z0-9_]+)"/g, /\bfindingCode\s*:\s*"([A-Z][A-Z0-9_]+)"/g];
      for (const re of patterns) for (const m of src.matchAll(re)) out.set(m[1], `owner-${d}/${file}`);
    }
  }
  return out;
}

describe("every code that can reach the owner action gate has an explicit intent", () => {
  it("reads the real producers (every domain contributes codes)", () => {
    const codes = producedCodes();
    expect(codes.size).toBeGreaterThan(100);
    for (const d of DOMAINS) expect([...codes.values()].some((f) => f.startsWith(`owner-${d}/`)), d).toBe(true);
    expect(existsSync(join(ROOT, "src/services/owner-mode/owner-action-gate.service.ts"))).toBe(true);
  });

  it("no produced code relies on the fallback classification", () => {
    const unclassified = [...producedCodes()].filter(([code]) => !hasExplicitOwnerIntent(code)).map(([code, file]) => `${code} (${file})`);
    expect(unclassified).toEqual([]);
  });

  it("every produced code resolves to one of the six intents", () => {
    for (const [code] of producedCodes()) expect(OWNER_TARGET_INTENTS, code).toContain(ownerFindingIntent(code));
  });

  it("the documented fallback: an unknown legacy code is GROW (held back by the growth limits), never a protective intent", () => {
    expect(hasExplicitOwnerIntent("LEGACY_UNKNOWN_CODE")).toBe(false);
    expect(ownerFindingIntent("LEGACY_UNKNOWN_CODE")).toBe("GROW");
  });

  it("Strategy steps take their class under the live decision (the canonical decision's own classification)", () => {
    // Money at risk while the plan is on hold: protecting the business, not growth.
    expect(ownerStrategyStepIntent("NOT_YET", "STR_UNAFFORDABLE")).toBe("STABILISE");
    expect(ownerStrategyStepIntent("GO", "STR_UNAFFORDABLE")).toBe("GROW");
    // Data requests stay EVIDENCE whatever the decision.
    expect(ownerStrategyStepIntent("NEED_INFO", "STR_DECISION_INVALID_INPUT")).toBe("EVIDENCE");
    expect(ownerStrategyStepIntent("NEED_INFO", "STR_MISSING_CASH")).toBe("EVIDENCE");
  });
});
