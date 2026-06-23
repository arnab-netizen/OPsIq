import { describe, it, expect } from "vitest";
import {
  loadRealWorldSmbFixtures,
  getRealWorldSmbCaseById,
  listRealWorldSmbCaseIds,
} from "./loadFixtures";

const EXPECTED_COUNT = 12;

describe("loadRealWorldSmbFixtures: all 12 cases load", () => {
  it(`loads exactly ${EXPECTED_COUNT} fixtures from the JSONL file`, () => {
    const fixtures = loadRealWorldSmbFixtures();
    expect(fixtures).toHaveLength(EXPECTED_COUNT);
  });

  it("returns typed SmbFixture objects with required fields", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const f of fixtures) {
      expect(f.case_id).toMatch(/^SMB-\d{3}$/);
      expect(f.title).toBeTruthy();
      expect(f.scenario.symptoms.length).toBeGreaterThan(0);
      expect(f.expected_opsiq_diagnosis.primary_root_cause).toBeTruthy();
    }
  });
});

describe("listRealWorldSmbCaseIds: expected IDs SMB-001 through SMB-012 exist", () => {
  it("returns all 12 expected IDs", () => {
    const ids = listRealWorldSmbCaseIds();
    expect(ids).toHaveLength(EXPECTED_COUNT);
    for (let i = 1; i <= EXPECTED_COUNT; i++) {
      const expected = `SMB-${String(i).padStart(3, "0")}`;
      expect(ids).toContain(expected);
    }
  });
});

describe("getRealWorldSmbCaseById: restaurant case lookup", () => {
  it("returns the restaurant case for SMB-004", () => {
    const fixture = getRealWorldSmbCaseById("SMB-004");
    expect(fixture.case_id).toBe("SMB-004");
    expect(fixture.segment).toBe("food_service_smb");
    expect(fixture.expected_opsiq_diagnosis.primary_root_cause).toBe(
      "prime_cost_margin_erosion"
    );
    expect(
      fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify
    ).toContain("prime cost");
  });
});

describe("getRealWorldSmbCaseById: unknown ID throws", () => {
  it("throws a descriptive error for an unknown case_id", () => {
    expect(() => getRealWorldSmbCaseById("SMB-999")).toThrow(/SMB-999.*not found/);
  });

  it("error message lists available IDs", () => {
    expect(() => getRealWorldSmbCaseById("SMB-999")).toThrow(/SMB-001/);
  });
});

describe("fixture count contract", () => {
  it(`fails if fixture count is not exactly ${EXPECTED_COUNT}`, () => {
    const fixtures = loadRealWorldSmbFixtures();
    // This test is the contract: if someone adds or removes a fixture, this fails
    expect(fixtures.length).toBe(EXPECTED_COUNT);
  });

  it("all IDs are unique (no duplicates passed schema validation)", () => {
    const ids = listRealWorldSmbCaseIds();
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
