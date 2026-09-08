/**
 * P0-A — historical (pre-isFixtureBusiness) acceptance business classification. Proves the
 * remediation is fail-closed: a row is only a "confident" candidate when name AND actor agree;
 * a name-only match is downgraded to "ambiguous" and never proposed for reclassification.
 */
import { describe, it, expect } from "vitest";
import {
  classifyLegacyFixtureCandidates,
  type LegacyBusinessCandidateInput,
} from "@/domain/founder-recovery/legacy-fixture-classification";

const QA_EMAILS = ["qa-acceptance@opsiq.internal"];

const row = (overrides: Partial<LegacyBusinessCandidateInput>): LegacyBusinessCandidateInput => ({
  id: "b1",
  name: "OPSIQ Acceptance - Finance - 12345",
  isFixtureBusiness: false,
  createdByEmail: "qa-acceptance@opsiq.internal",
  ...overrides,
});

describe("classifyLegacyFixtureCandidates", () => {
  it("name matches and actor is known: confident candidate", () => {
    const r = classifyLegacyFixtureCandidates([row({})], QA_EMAILS);
    expect(r).toEqual({ confidentFixtureIds: ["b1"], ambiguousIds: [] });
  });

  it("'OPSIQ Production Acceptance ...' variant also matches when actor is known", () => {
    const r = classifyLegacyFixtureCandidates(
      [row({ name: "OPSIQ Production Acceptance - Startup Handoff - 99" })],
      QA_EMAILS
    );
    expect(r.confidentFixtureIds).toEqual(["b1"]);
  });

  it("name matches but actor is unknown: ambiguous, never confident", () => {
    const r = classifyLegacyFixtureCandidates(
      [row({ createdByEmail: "someone-else@example.com" })],
      QA_EMAILS
    );
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: ["b1"] });
  });

  it("name matches but createdBy could not be resolved to any user (null email): ambiguous", () => {
    const r = classifyLegacyFixtureCandidates([row({ createdByEmail: null })], QA_EMAILS);
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: ["b1"] });
  });

  it("real business whose name merely mentions 'Acceptance' elsewhere: excluded entirely, not even ambiguous", () => {
    const r = classifyLegacyFixtureCandidates(
      [row({ name: "Client Acceptance Corp", createdByEmail: "real-owner@example.com" })],
      QA_EMAILS
    );
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: [] });
  });

  it("real business with an ordinary name and a known-actor email coincidence: excluded (name signal absent)", () => {
    const r = classifyLegacyFixtureCandidates([row({ name: "Sunrise Bakery" })], QA_EMAILS);
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: [] });
  });

  it("already isFixtureBusiness: true — excluded, nothing left to classify", () => {
    const r = classifyLegacyFixtureCandidates([row({ isFixtureBusiness: true })], QA_EMAILS);
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: [] });
  });

  it("name pattern match is case-insensitive; actor email match is case-insensitive", () => {
    const r = classifyLegacyFixtureCandidates(
      [row({ name: "opsiq acceptance - Sales - 1", createdByEmail: "QA-Acceptance@OpsIQ.Internal" })],
      QA_EMAILS
    );
    expect(r.confidentFixtureIds).toEqual(["b1"]);
  });

  it("mixed batch: buckets each row independently", () => {
    const rows: LegacyBusinessCandidateInput[] = [
      row({ id: "confident-1" }),
      row({ id: "ambiguous-1", createdByEmail: "unknown@example.com" }),
      row({ id: "real-1", name: "Sunrise Bakery", createdByEmail: "real-owner@example.com" }),
      row({ id: "already-tagged", isFixtureBusiness: true }),
    ];
    const r = classifyLegacyFixtureCandidates(rows, QA_EMAILS);
    expect(r.confidentFixtureIds).toEqual(["confident-1"]);
    expect(r.ambiguousIds).toEqual(["ambiguous-1"]);
  });

  it("no known acceptance actor emails configured: every name-matching row is ambiguous, none confident", () => {
    const r = classifyLegacyFixtureCandidates([row({})], []);
    expect(r).toEqual({ confidentFixtureIds: [], ambiguousIds: ["b1"] });
  });
});
