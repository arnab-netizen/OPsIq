import { describe, it, expect } from "vitest";
import { findingTypeLabel, eventNameLabel, entityTypeLabel } from "@/lib/audit-label";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

// Values that are own properties of every plain JS object literal via Object.prototype. A lookup
// implementation using a bare `map[key]` (rather than an explicit own-property check) would
// resolve these to an inherited function/method instead of falling through to the "unknown"
// branch -- silently returning a non-string, unrenderable value.
const PROTOTYPE_POLLUTION_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

describe("findingTypeLabel", () => {
  it("labels a known value (opportunity) accurately", () => {
    expect(findingTypeLabel("opportunity")).toBe("Opportunity");
  });

  it("labels a known value (risk) accurately, case-insensitively", () => {
    expect(findingTypeLabel("RISK")).toBe("Risk");
  });

  it("labels an unknown-but-present value with the honest neutral label, never a reformat", () => {
    expect(findingTypeLabel("warning")).toBe("Other finding");
  });

  it("distinguishes missing (null) from unknown-but-present", () => {
    expect(findingTypeLabel(null)).toBe("Finding type not recorded");
  });

  it("distinguishes missing (undefined) from unknown-but-present", () => {
    expect(findingTypeLabel(undefined)).toBe("Finding type not recorded");
  });

  it("distinguishes missing (empty string) from unknown-but-present", () => {
    expect(findingTypeLabel("")).toBe("Finding type not recorded");
  });

  it("treats a non-string value as unknown-but-present (Other), not missing", () => {
    expect(findingTypeLabel(42)).toBe("Other finding");
  });

  it.each(PROTOTYPE_POLLUTION_KEYS)(
    "never resolves the inherited Object.prototype member %j -- falls through to the safe neutral label",
    (key) => {
      expect(() => findingTypeLabel(key)).not.toThrow();
      expect(findingTypeLabel(key)).toBe("Other finding");
    }
  );
});

describe("eventNameLabel", () => {
  it("labels a known, curated diagnosis-run event accurately, reusing the real AUDIT_EVENTS constant", () => {
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_RUN)).toBe("Finance diagnosis run");
  });

  it("labels every curated diagnosis-cycle event across all 7 domains", () => {
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_SALES_DIAGNOSIS_RUN)).toBe("Sales diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_CASHFLOW_DIAGNOSIS_RUN)).toBe("Cashflow diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_OPERATIONS_DIAGNOSIS_RUN)).toBe("Operations diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_SOP_DIAGNOSIS_RUN)).toBe("Execution diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_MARKETING_DIAGNOSIS_RUN)).toBe("Marketing diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_STRATEGY_DIAGNOSIS_RUN)).toBe("Strategy diagnosis run");
    expect(eventNameLabel(AUDIT_EVENTS.OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE)).toBe("Finance diagnosis flagged low confidence");
  });

  it("labels a real but out-of-scope AUDIT_EVENTS value (not tied to a diagnosis cycle) as Other, not a reformat", () => {
    // A genuinely defined, repository-known event -- just not one this audit trail can ever show,
    // since it is never emitted with a cycle id as its entityId. Mechanical reformatting of this
    // value would produce something readable-looking but is not what this page verified it means.
    expect(eventNameLabel(AUDIT_EVENTS.USER_LOGGED_IN)).toBe("Other event");
  });

  it("labels a genuinely unrecognized/historical event value with the honest neutral label, never a reformat", () => {
    expect(eventNameLabel("legacy_module.unrecognized_event_v1")).toBe("Other event");
  });

  it("distinguishes missing (null) from unknown-but-present", () => {
    expect(eventNameLabel(null)).toBe("Event not recorded");
  });

  it("distinguishes missing (empty string) from unknown-but-present", () => {
    expect(eventNameLabel("")).toBe("Event not recorded");
  });

  it("treats a non-string value as unknown-but-present (Other), not missing", () => {
    expect(eventNameLabel(42)).toBe("Other event");
  });

  it.each(PROTOTYPE_POLLUTION_KEYS)(
    "never resolves the inherited Object.prototype member %j -- falls through to the safe neutral label",
    (key) => {
      expect(() => eventNameLabel(key)).not.toThrow();
      expect(eventNameLabel(key)).toBe("Other event");
    }
  );
});

describe("entityTypeLabel", () => {
  it("labels a known, curated entity type accurately", () => {
    expect(entityTypeLabel("OwnerFinanceCycle")).toBe("Finance cycle");
  });

  it("labels every curated entity type across all 7 domains", () => {
    expect(entityTypeLabel("OwnerSalesCycle")).toBe("Sales cycle");
    expect(entityTypeLabel("OwnerCashflowCycle")).toBe("Cashflow cycle");
    expect(entityTypeLabel("OwnerOperationsCycle")).toBe("Operations cycle");
    expect(entityTypeLabel("OwnerSopCycle")).toBe("Execution cycle");
    expect(entityTypeLabel("OwnerMarketingCycle")).toBe("Marketing cycle");
    expect(entityTypeLabel("OwnerStrategyCycle")).toBe("Strategy cycle");
  });

  it("labels a real but out-of-scope entity type (used elsewhere in the codebase) as Other, not a reformat", () => {
    // "delegated_task" is a real entityType this codebase writes elsewhere (execution/task
    // services) but never against a diagnosis-cycle id -- outside Trust's verified scope.
    expect(entityTypeLabel("delegated_task")).toBe("Other entity type");
  });

  it("labels a genuinely unrecognized/historical entity type with the honest neutral label, never a reformat", () => {
    expect(entityTypeLabel("SomeFutureEntityType")).toBe("Other entity type");
  });

  it("distinguishes missing (undefined) from unknown-but-present", () => {
    expect(entityTypeLabel(undefined)).toBe("Entity type not recorded");
  });

  it("distinguishes missing (whitespace-only string) from unknown-but-present", () => {
    expect(entityTypeLabel("   ")).toBe("Entity type not recorded");
  });

  it("treats a non-string value as unknown-but-present (Other), not missing", () => {
    expect(entityTypeLabel({ not: "a string" })).toBe("Other entity type");
  });

  it.each(PROTOTYPE_POLLUTION_KEYS)(
    "never resolves the inherited Object.prototype member %j -- falls through to the safe neutral label",
    (key) => {
      expect(() => entityTypeLabel(key)).not.toThrow();
      expect(entityTypeLabel(key)).toBe("Other entity type");
    }
  );
});
