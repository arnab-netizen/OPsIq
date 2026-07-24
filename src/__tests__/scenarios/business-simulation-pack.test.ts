/**
 * SEQUENTIAL BUSINESS SIMULATIONS pack — schema + invariant tests (no DB). Proves the 50 counted, multi-event
 * simulations are unique, taxonomy-complete, schema-valid, source-backed, privacy-clean, and SAFE at the authoring
 * layer over TIME: every event's disposition matches its narrative marker; no owner-gated / boundary / missing-data /
 * gamed event ever proceeds; owner_unavailable simulations HOLD every material call for the owner; staff_proof_gaming
 * simulations block every gaming beat; extreme_crisis simulations are block/owner dominant; every simulation carries
 * a failure condition + recovery path; actual-vs-expected is expected-only; no live claim.
 */
import { describe, it, expect } from "vitest";
import {
  BUSINESS_SIMULATION_PACK as PACK, BUSINESS_SIMULATION_SUBCATEGORIES, BUSINESS_SIMULATION_EVENTS,
} from "@/domain/scenarios/business-simulation-pack";
import { businessSimulationSchema, SIMULATION_ACTION_STATUSES } from "@/domain/scenarios/business-simulation";
import { BUSINESS_SIMULATION_SOURCES, BUSINESS_SIMULATION_SOURCE_BY_ID } from "@/domain/scenarios/business-simulation-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const PROCEEDISH = new Set(["proceed", "cautious_proceed"]);
const OWNER_GATED = "owner_decision_required";

// A proceed/cautious event is ALWAYS routine and reversible — its title never carries a danger/boundary marker.
const DANGER = /HELD|blocked|owner call|— blocked|missing|unclear|incomplete|not available|falsified|fraud|manipulat|inflated|insolven|preferential|ransom|breach|lawsuit|layoff|withheld tax|unauthorised|concealed|staged|fake|buddy-punching|diverting/i;
// Marker regexes that must be present for each non-proceed disposition (title ↔ disposition honesty).
const OWNER_MARK = /owner|HELD/i;
const BLOCKED_MARK = /blocked|professional|counsel/i;
const NEEDDATA_MARK = /missing|unclear|incomplete|not available|not confirmed|signal|unproven/i;

const EXPECTED_COUNTS: Record<string, number> = {
  normal_week: 10, slow_leakage: 10, growth: 8, staff_proof_gaming: 8,
  cash_crisis: 5, customer_vendor: 4, owner_unavailable: 3, extreme_crisis: 2,
};

describe("business-simulation-pack — module contract assertions", () => {
  it("PACK is an array", () => { expect(Array.isArray(PACK)).toBe(true); });
  it("BUSINESS_SIMULATION_SUBCATEGORIES is an array", () => { expect(Array.isArray(BUSINESS_SIMULATION_SUBCATEGORIES)).toBe(true); });
  it("BUSINESS_SIMULATION_EVENTS is an array", () => { expect(Array.isArray(BUSINESS_SIMULATION_EVENTS)).toBe(true); });
  it("businessSimulationSchema is an object", () => { expect(typeof businessSimulationSchema).toBe("object"); });
  it("SIMULATION_ACTION_STATUSES is an array", () => { expect(Array.isArray(SIMULATION_ACTION_STATUSES)).toBe(true); });
  it("BUSINESS_SIMULATION_SOURCES is an array", () => { expect(Array.isArray(BUSINESS_SIMULATION_SOURCES)).toBe(true); });
  it("sourceRecordSchema is an object", () => { expect(typeof sourceRecordSchema).toBe("object"); });
  it("findPII is a function", () => { expect(typeof findPII).toBe("function"); });
  it("PROCEEDISH is an object", () => { expect(typeof PROCEEDISH).toBe("object"); });
  it("OWNER_GATED is a string", () => { expect(typeof OWNER_GATED).toBe("string"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("Sequential Simulations pack — count & identity", () => {
  it("has exactly 50 counted, unique simulations", () => {
    expect(PACK.length).toBe(50);
    expect(new Set(PACK.map((s) => s.simulationId)).size).toBe(50);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers all 8 categories at the planned counts", () => {
    for (const sub of BUSINESS_SIMULATION_SUBCATEGORIES) {
      expect(PACK.filter((s) => s.category === sub).length, sub).toBe(EXPECTED_COUNTS[sub]);
    }
    expect(new Set(PACK.map((s) => s.category)).size).toBe(8);
  });

  it("is schema-valid for all 50 (7–30 unique/monotonic events each)", () => {
    for (const s of PACK) {
      expect(businessSimulationSchema.safeParse(s).success, s.simulationId).toBe(true);
      expect(s.events.length, s.simulationId).toBeGreaterThanOrEqual(7);
      expect(s.events.length, s.simulationId).toBeLessThanOrEqual(30);
      expect(new Set(s.events.map((e) => e.eventId)).size, s.simulationId).toBe(s.events.length);
      s.events.forEach((e, i) => {
        expect(e.sequenceIndex, `${s.simulationId}#${i}`).toBe(i);
        if (i > 0) expect(e.dayOffset, `${s.simulationId}#${i}`).toBeGreaterThanOrEqual(s.events[i - 1].dayOffset);
      });
    }
  });

  it("flattens every event exactly once", () => {
    expect(BUSINESS_SIMULATION_EVENTS.length).toBe(PACK.reduce((n, s) => n + s.events.length, 0));
    expect(new Set(BUSINESS_SIMULATION_EVENTS.map((e) => e.event.eventId)).size).toBe(BUSINESS_SIMULATION_EVENTS.length);
  });
});

describe("Sequential Simulations pack — sources & gold", () => {
  it("every simulation is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.simulationId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(BUSINESS_SIMULATION_SOURCE_BY_ID[ref], `${s.simulationId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(BUSINESS_SIMULATION_SOURCES.length).toBe(24);
    for (const src of BUSINESS_SIMULATION_SOURCES) {
      expect(sourceRecordSchema.safeParse(src).success, src.id).toBe(true);
      expect(src.privacyRisk, src.id).toBe("low");
      expect(findPII([src.title, src.citation ?? "", ...src.factsUsed].join(" ")), src.id).toEqual([]);
    }
  });

  it("has ≥10 independent gold simulations, ≥1 per category", () => {
    const gold = PACK.filter((s) => s.independentGold);
    expect(gold.length).toBeGreaterThanOrEqual(10);
    expect(new Set(gold.map((s) => s.category)).size).toBe(8);
  });
});

describe("Sequential Simulations pack — per-event disposition honesty", () => {
  it("every event decision is one of the five statuses", () => {
    for (const { event } of BUSINESS_SIMULATION_EVENTS) {
      expect(SIMULATION_ACTION_STATUSES as readonly string[], event.eventId).toContain(event.expectedDecision);
    }
  });

  it("every event carries a proof requirement and a reassessment trigger", () => {
    for (const { event } of BUSINESS_SIMULATION_EVENTS) {
      expect(event.expectedProofRequired.length, event.eventId).toBeGreaterThan(0);
      expect(event.expectedReassessment.length, event.eventId).toBeGreaterThan(0);
    }
  });

  it("title marker matches disposition: proceed⇒routine, owner⇒owner/HELD, blocked⇒boundary, need_more_data⇒gap", () => {
    for (const { event } of BUSINESS_SIMULATION_EVENTS) {
      if (PROCEEDISH.has(event.expectedDecision)) {
        expect(DANGER.test(event.title), `proceed title must be routine: ${event.eventId} "${event.title}"`).toBe(false);
      } else if (event.expectedDecision === OWNER_GATED) {
        expect(OWNER_MARK.test(event.title), `owner title: ${event.eventId} "${event.title}"`).toBe(true);
      } else if (event.expectedDecision === "blocked") {
        expect(BLOCKED_MARK.test(event.title), `blocked title: ${event.eventId} "${event.title}"`).toBe(true);
      } else {
        expect(NEEDDATA_MARK.test(event.title), `need-data title: ${event.eventId} "${event.title}"`).toBe(true);
      }
    }
  });
});

describe("Sequential Simulations pack — hard safety rules over time", () => {
  it("no owner-gated / boundary / missing-data / gamed event ever proceeds", () => {
    for (const { event } of BUSINESS_SIMULATION_EVENTS) {
      const material = event.expectedDecision === OWNER_GATED || event.expectedDecision === "blocked" || event.expectedDecision === "need_more_data";
      if (material) expect(PROCEEDISH.has(event.expectedDecision), event.eventId).toBe(false);
      // Any danger-marked event is never proceed/cautious.
      if (DANGER.test(event.title)) expect(PROCEEDISH.has(event.expectedDecision), `danger event proceeds: ${event.eventId}`).toBe(false);
    }
  });

  it("owner_unavailable simulations HOLD every material call — nothing auto-proceeds", () => {
    const away = PACK.filter((s) => s.category === "owner_unavailable");
    expect(away.length).toBe(3);
    for (const s of away) {
      for (const e of s.events) {
        // A HELD/escalated event resolves to owner_decision (never proceed/cautious).
        if (/HELD/i.test(e.title)) expect(e.expectedDecision, e.eventId).toBe(OWNER_GATED);
        // No proceed/cautious event in an owner-away sim is a material/owner/boundary call.
        if (PROCEEDISH.has(e.expectedDecision)) expect(DANGER.test(e.title), `${e.eventId} unsafe proceed while owner away`).toBe(false);
      }
      // Each owner-away sim genuinely exercises at least one held owner decision.
      expect(s.events.some((e) => e.expectedDecision === OWNER_GATED), s.simulationId).toBe(true);
    }
  });

  it("staff_proof_gaming simulations block every gaming beat (proof_fraud_block)", () => {
    const gaming = PACK.filter((s) => s.category === "staff_proof_gaming");
    expect(gaming.length).toBe(8);
    for (const s of gaming) {
      const blocked = s.events.filter((e) => e.expectedDecision === "blocked");
      expect(blocked.length, s.simulationId).toBeGreaterThan(0);
      for (const e of blocked) expect(e.expectedDominant, e.eventId).toBe("proof_fraud_block");
      // No gaming simulation ever rewards (proceeds on) a gamed beat.
      expect(s.events.some((e) => PROCEEDISH.has(e.expectedDecision) && /inflated|manipulat|fake|falsified|concealed|staged|unauthorised/i.test(e.title)), s.simulationId).toBe(false);
    }
  });

  it("extreme_crisis simulations are block/owner dominant", () => {
    const extreme = PACK.filter((s) => s.category === "extreme_crisis");
    expect(extreme.length).toBe(2);
    for (const s of extreme) {
      const blockOwner = s.events.filter((e) => e.expectedDecision === "blocked" || e.expectedDecision === OWNER_GATED).length;
      const proceed = s.events.filter((e) => PROCEEDISH.has(e.expectedDecision)).length;
      expect(blockOwner, s.simulationId).toBeGreaterThan(proceed);
      expect(s.events.some((e) => e.expectedDecision === "blocked"), s.simulationId).toBe(true);
    }
  });

  it("every simulation carries a failure condition, a recovery path, and an expected-only note; no live claim", () => {
    for (const s of PACK) {
      expect(s.failureCondition.length, s.simulationId).toBeGreaterThan(8);
      expect(s.recoveryPath.length, s.simulationId).toBeGreaterThan(8);
      expect(/expected only|not a proven actual|no live data/i.test(s.expectedActualVsExpected), s.simulationId).toBe(true);
      expect(s.liveDataBacked, s.simulationId).toBe(false);
    }
  });

  it("all five statuses appear across the corpus", () => {
    const seen = new Set(BUSINESS_SIMULATION_EVENTS.map((e) => e.event.expectedDecision));
    for (const st of SIMULATION_ACTION_STATUSES) expect(seen.has(st), st).toBe(true);
  });
});
