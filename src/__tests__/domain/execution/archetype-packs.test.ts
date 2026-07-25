import { describe, it, expect } from "vitest";
import {
  createLaundryPack,
  createHousekeepingPack,
  assessPackConfidence,
  applyPromotedKnowledge,
  KnowledgePromotionRequiredError,
  LAUNDRY_PACK_SLOTS,
  HOUSEKEEPING_PACK_SLOTS,
} from "@/domain/execution/archetype-packs";
import {
  ContextConfidence,
  createKnowledgeUpdateCandidate,
  decideKnowledgePromotion,
} from "@/domain/execution/business-context";

describe("archetype context packs — module contract assertions", () => {
  it("createLaundryPack is a function", () => {
    expect(typeof createLaundryPack).toBe("function");
  });
  it("createHousekeepingPack is a function", () => {
    expect(typeof createHousekeepingPack).toBe("function");
  });
  it("assessPackConfidence is a function", () => {
    expect(typeof assessPackConfidence).toBe("function");
  });
  it("applyPromotedKnowledge is a function", () => {
    expect(typeof applyPromotedKnowledge).toBe("function");
  });
  it("LAUNDRY_PACK_SLOTS is an array with >= 1 entry", () => {
    expect(Array.isArray(LAUNDRY_PACK_SLOTS)).toBe(true);
    expect(LAUNDRY_PACK_SLOTS.length).toBeGreaterThanOrEqual(1);
  });
  it("HOUSEKEEPING_PACK_SLOTS is an array with >= 1 entry", () => {
    expect(Array.isArray(HOUSEKEEPING_PACK_SLOTS)).toBe(true);
    expect(HOUSEKEEPING_PACK_SLOTS.length).toBeGreaterThanOrEqual(1);
  });
  it("KnowledgePromotionRequiredError is defined", () => {
    expect(KnowledgePromotionRequiredError).toBeDefined();
  });
  it("ContextConfidence.LOW is defined", () => {
    expect(ContextConfidence.LOW).toBeDefined();
  });
  it("ContextConfidence.MEDIUM is defined", () => {
    expect(ContextConfidence.MEDIUM).toBeDefined();
  });
  it("ContextConfidence.HIGH is defined", () => {
    expect(ContextConfidence.HIGH).toBeDefined();
  });
  it("createLaundryPack() returns an object", () => {
    expect(typeof createLaundryPack()).toBe("object");
  });
  it("createLaundryPack().slots is an object", () => {
    expect(typeof createLaundryPack().slots).toBe("object");
  });
  it("assessPackConfidence(createLaundryPack()) returns an object", () => {
    expect(typeof assessPackConfidence(createLaundryPack())).toBe("object");
  });
  it("assessPackConfidence result has a confidence field", () => {
    expect(assessPackConfidence(createLaundryPack())).toHaveProperty("confidence");
  });
  it("assessPackConfidence result has a filledSlots field (array)", () => {
    expect(Array.isArray(assessPackConfidence(createLaundryPack()).filledSlots)).toBe(true);
  });
  it("assessPackConfidence result has a missingSlots field (array)", () => {
    expect(Array.isArray(assessPackConfidence(createLaundryPack()).missingSlots)).toBe(true);
  });
});

describe("archetype context packs (Slice 22)", () => {
  it("laundry + housekeeping pack skeletons exist with their slots", () => {
    const l = createLaundryPack();
    const h = createHousekeepingPack();
    expect(Object.keys(l.slots).length).toBe(LAUNDRY_PACK_SLOTS.length);
    expect(Object.keys(h.slots).length).toBe(HOUSEKEEPING_PACK_SLOTS.length);
    expect(l.slots["pricing_trends"]).toBeDefined();
    expect(h.slots["staff_attendance_risk"]).toBeDefined();
  });

  it("an empty pack has LOW confidence and reports all missing slots", () => {
    const l = createLaundryPack();
    const r = assessPackConfidence(l);
    expect(r.confidence).toBe(ContextConfidence.LOW);
    expect(r.filledSlots).toEqual([]);
    expect(r.missingSlots.length).toBe(LAUNDRY_PACK_SLOTS.length);
  });

  it("a pack update requires a promoted candidate (candidate/promotion flow)", () => {
    const pack = createLaundryPack();
    const candidate = createKnowledgeUpdateCandidate({
      candidateId: "c1",
      archetype: "laundry",
      jurisdiction: "IN",
      sourceId: "src-1",
      summary: "local discount norm ~10%",
    });
    // unpromoted candidate cannot be applied
    expect(() =>
      applyPromotedKnowledge(pack, "discount_norms", candidate, "~10%", ContextConfidence.MEDIUM)
    ).toThrow(KnowledgePromotionRequiredError);

    // after explicit promotion it applies
    const promoted = decideKnowledgePromotion(candidate, {
      approvedByReviewerId: "owner-1",
      approved: true,
      reason: "verified",
    });
    const updated = applyPromotedKnowledge(pack, "discount_norms", promoted, "~10%", ContextConfidence.MEDIUM);
    expect(updated.slots["discount_norms"].value).toBe("~10%");
    expect(updated.slots["discount_norms"].sourceId).toBe("src-1");
    // original pack is unchanged
    expect(pack.slots["discount_norms"].value).toBeNull();
  });

  it("filling slots raises overall pack confidence", () => {
    let pack = createHousekeepingPack();
    const promoted = decideKnowledgePromotion(
      createKnowledgeUpdateCandidate({ candidateId: "c", archetype: "housekeeping", sourceId: "s", summary: "x" }),
      { approvedByReviewerId: "o", approved: true, reason: "ok" }
    );
    for (const key of HOUSEKEEPING_PACK_SLOTS) {
      pack = applyPromotedKnowledge(pack, key, promoted, "value", ContextConfidence.MEDIUM);
    }
    expect(assessPackConfidence(pack).confidence).toBe(ContextConfidence.HIGH);
  });
});
