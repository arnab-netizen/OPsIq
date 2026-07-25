import { describe, it, expect } from "vitest";
import { archetypeFromBusinessType, archetypeGuidance } from "@/domain/owner-guidance/archetype-guidance";

describe("[module41] archetype guidance — extended contract", () => {
  it("archetypeGuidance('laundry_local_service').workerNoun contains 'staff'", () => {
    expect(archetypeGuidance("laundry_local_service").workerNoun).toContain("staff");
  });
  it("archetypeGuidance('housekeeping_cleaning').workerNoun contains 'staff'", () => {
    expect(archetypeGuidance("housekeeping_cleaning").workerNoun).toContain("staff");
  });
  it("archetypeGuidance('home_services_maintenance').workerNoun contains 'technician'", () => {
    expect(archetypeGuidance("home_services_maintenance").workerNoun).toContain("technician");
  });
  it("archetypeGuidance('anything_else').workerNoun is 'staff'", () => {
    expect(archetypeGuidance("anything_else").workerNoun).toBe("staff");
  });
  it("archetypeGuidance returns object with pack, customerNoun, workerNoun keys", () => {
    const g = archetypeGuidance("laundry_local_service");
    expect("pack" in g).toBe(true);
    expect("customerNoun" in g).toBe(true);
    expect("workerNoun" in g).toBe(true);
  });
  it("archetypeGuidance('housekeeping_cleaning').pack is 'housekeeping'", () => {
    expect(archetypeGuidance("housekeeping_cleaning").pack).toBe("housekeeping");
  });
  it("archetypeGuidance(null) returns generic defaults (pack null, customerNoun 'customers')", () => {
    const g = archetypeGuidance(null);
    expect(g.pack).toBeNull();
    expect(g.customerNoun).toBe("customers");
    expect(g.workerNoun).toBe("staff");
  });
  it("archetypeGuidance(undefined) returns generic defaults", () => {
    const g = archetypeGuidance(undefined);
    expect(g.pack).toBeNull();
    expect(g.workerNoun).toBe("staff");
  });
  it("archetypeGuidance('home_services_maintenance').pack is 'home_services'", () => {
    expect(archetypeGuidance("home_services_maintenance").pack).toBe("home_services");
  });
  it("archetypeGuidance('anything_else').pack is null", () => {
    expect(archetypeGuidance("anything_else").pack).toBeNull();
  });
  it("archetypeFromBusinessType('home_services_maintenance') maps to 'home_services'", () => {
    expect(archetypeFromBusinessType("home_services_maintenance")).toBe("home_services");
  });
  it("archetypeFromBusinessType('generic_local_service') maps to 'generic'", () => {
    expect(archetypeFromBusinessType("generic_local_service")).toBe("generic");
  });
  it("archetypeFromBusinessType unknown type returns 'generic'", () => {
    expect(archetypeFromBusinessType("completely_unknown_type")).toBe("generic");
  });
  it("archetypeGuidance customerNoun is non-empty for all supported business types", () => {
    for (const bt of ["laundry_local_service", "housekeeping_cleaning", "home_services_maintenance", "anything_else"]) {
      expect(archetypeGuidance(bt).customerNoun.length).toBeGreaterThan(0);
    }
  });
  it("archetypeGuidance workerNoun is non-empty for all supported business types", () => {
    for (const bt of ["laundry_local_service", "housekeeping_cleaning", "home_services_maintenance", "anything_else"]) {
      expect(archetypeGuidance(bt).workerNoun.length).toBeGreaterThan(0);
    }
  });
  it("archetypeFromBusinessType returns a string for all known input types", () => {
    for (const bt of ["laundry_local_service", "housekeeping_cleaning", "home_services_maintenance", "field_repair", "generic_local_service"]) {
      expect(typeof archetypeFromBusinessType(bt)).toBe("string");
    }
  });
  it("archetypeGuidance('laundry_local_service').customerNoun includes 'linen'", () => {
    expect(archetypeGuidance("laundry_local_service").customerNoun).toContain("linen");
  });
  it("archetypeGuidance('housekeeping_cleaning').customerNoun includes 'apartment'", () => {
    expect(archetypeGuidance("housekeeping_cleaning").customerNoun).toContain("apartment");
  });
});

describe("[module41] archetype mapping", () => {
  it("maps businessType strings to the correct archetype", () => {
    expect(archetypeFromBusinessType("laundry_local_service")).toBe("laundry");
    expect(archetypeFromBusinessType("housekeeping_cleaning")).toBe("housekeeping");
    expect(archetypeFromBusinessType("home_services_maintenance")).toBe("home_services");
    expect(archetypeFromBusinessType("field_repair")).toBe("home_services");
    expect(archetypeFromBusinessType("generic_local_service")).toBe("generic");
    expect(archetypeFromBusinessType(null)).toBe("generic");
    expect(archetypeFromBusinessType(undefined)).toBe("generic");
  });

  it("provides distinct customer/worker nouns + pack per archetype", () => {
    expect(archetypeGuidance("laundry_local_service").customerNoun).toContain("linen");
    expect(archetypeGuidance("laundry_local_service").pack).toBe("laundry");
    expect(archetypeGuidance("housekeeping_cleaning").customerNoun).toContain("apartment");
    expect(archetypeGuidance("home_services_maintenance").customerNoun).toContain("service-call");
    expect(archetypeGuidance("home_services_maintenance").pack).toBe("home_services");
    expect(archetypeGuidance("anything_else").customerNoun).toBe("customers");
    expect(archetypeGuidance("anything_else").pack).toBeNull();
  });
});
