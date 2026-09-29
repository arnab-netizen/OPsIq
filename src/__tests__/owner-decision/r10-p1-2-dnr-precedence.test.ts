/**
 * Round 10 P1-2 — exact do-not-repeat memory always outranks a broad one, deterministically, regardless
 * of DB row order or which was created first. Reproduces on 14c36b12 (Array.prototype.find returned
 * whichever rule the doNotRepeat array listed first) and passes now (owner-action-gate-policy.ts filters
 * by match kind before picking, never by array position).
 */
import { describe, it, expect } from "vitest";
import { evaluateOwnerActionGate, NO_OWNER_GATE_CONSTRAINTS, type OwnerGateDoNotRepeatRule } from "@/domain/owner-mode/owner-action-gate-policy";

const EXACT: OwnerGateDoNotRepeatRule = { id: "rule-exact", domain: "finance", match: "exact", findingId: "finding-1" };
const BROAD: OwnerGateDoNotRepeatRule = { id: "rule-broad", domain: "finance", match: "broad", findingId: null };

// EXECUTE: an exact finding memory applies to any intent; broad area memories apply only to GROW
// (or unknown intent) — ownerDoNotRepeatApplies (do-not-repeat-scope.ts). Broad-only scenarios below use
// GROW so the broad rule is actually reachable.
const SUBJECT = { domain: "finance", intent: "EXECUTE" as const, findingId: "finding-1", findingCode: "finding-1" };
const SUBJECT_GROW = { domain: "finance", intent: "GROW" as const, findingId: "finding-1", findingCode: "finding-1" };

describe("R10 P1-2: exact DNR precedence over broad", () => {
  // These use GROW intent deliberately: a broad rule only applies under GROW (or an unknown intent) —
  // ownerDoNotRepeatApplies. Under EXECUTE (or any other intent) the broad rule is filtered out entirely
  // regardless of array order, so exact would "win" trivially without proving real precedence. GROW is the
  // one intent where BOTH rules are genuinely co-applicable, which is exactly the ambiguity 14c36b12's
  // Array.prototype.find (whichever the array lists first) got wrong.
  it("broad listed first, exact second → exact rule wins", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [BROAD, EXACT] }, SUBJECT_GROW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-exact");
  });

  it("exact listed first, broad second → exact rule still wins", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [EXACT, BROAD] }, SUBJECT_GROW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-exact");
  });

  it("array reversed relative to the first case → still exact", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [EXACT, BROAD].reverse() }, SUBJECT_GROW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-exact");
  });

  it("only a broad rule applies (no exact) → broad rule decides", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [BROAD] }, SUBJECT_GROW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-broad");
  });

  it("exact lifted (not in the constraints array), broad still applies → broad decides", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [BROAD] }, SUBJECT_GROW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-broad");
  });

  it("neither applies → allowed", () => {
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [] }, SUBJECT);
    expect(v.allowed).toBe(true);
  });

  it("business attribution: a broad rule for a DIFFERENT domain never masks the exact rule for this one", () => {
    const otherDomainBroad: OwnerGateDoNotRepeatRule = { id: "rule-broad-sales", domain: "sales", match: "broad", findingId: null };
    const v = evaluateOwnerActionGate({ ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: [otherDomainBroad, EXACT] }, SUBJECT);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.ruleId).toBe("rule-exact");
  });
});
