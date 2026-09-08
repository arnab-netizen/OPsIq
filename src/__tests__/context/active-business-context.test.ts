/**
 * ActiveBusinessContext.resolveActiveBusiness — invalid-context recovery invariant.
 *
 * A real usability test's root cause fix (global business context) initially had a latent trust
 * violation: "preferred valid? use it; else use list[0]" silently substitutes a different
 * business whenever the previously-selected one becomes invalid (archived, deleted, a foreign
 * id, or a fixture id the ordinary owner list no longer includes) while more than one legitimate
 * business exists. This proves the corrected rule: a genuine prior selection that no longer
 * resolves, with a real choice to make, must surface as an explicit recovery state — never a
 * silent substitution — while an ordinary first run (no prior selection at all) or the
 * single-remaining-business case may still resolve automatically.
 */
import { describe, it, expect } from "vitest";
import { resolveActiveBusiness, type ActiveBusinessLite } from "@/context/active-business-context";

const biz = (id: string, name = id): ActiveBusinessLite => ({ id, name });

describe("resolveActiveBusiness", () => {
  it("1 business, no prior preference: auto-selects it (ordinary first run)", () => {
    const result = resolveActiveBusiness([biz("a")], null);
    expect(result).toEqual({ id: "a", needsRecovery: false });
  });

  it("2 businesses, no prior preference: auto-selects the first (ordinary first run, not a recovery)", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], null);
    expect(result).toEqual({ id: "a", needsRecovery: false });
  });

  it("2 businesses, valid stored preference: uses it, no recovery", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], "b");
    expect(result).toEqual({ id: "b", needsRecovery: false });
  });

  it("archived selected business (stored id no longer in the list, 2 legitimate businesses remain): needs recovery, does NOT silently substitute", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], "archived-c");
    expect(result).toEqual({ id: null, needsRecovery: true });
  });

  it("foreign business id (belongs to another workspace, never in this list): needs recovery when multiple businesses exist", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], "foreign-id-not-owned");
    expect(result).toEqual({ id: null, needsRecovery: true });
  });

  it("fixture-selected id (a fixture business the ordinary list excludes): needs recovery when multiple real businesses exist", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], "fixture-biz-id");
    expect(result).toEqual({ id: null, needsRecovery: true });
  });

  it("invalid/corrupt stored id: needs recovery when multiple businesses exist", () => {
    const result = resolveActiveBusiness([biz("a"), biz("b")], "{corrupt-json-garbage}");
    expect(result).toEqual({ id: null, needsRecovery: true });
  });

  it("stored id invalid but only ONE legitimate business remains: safe to auto-reanchor, no recovery gate", () => {
    const result = resolveActiveBusiness([biz("a")], "archived-b");
    expect(result).toEqual({ id: "a", needsRecovery: false });
  });

  it("zero businesses: null id, no recovery (nothing to choose between)", () => {
    const result = resolveActiveBusiness([], "anything");
    expect(result).toEqual({ id: null, needsRecovery: false });
  });

  it("zero businesses, no stored preference: null id, no recovery", () => {
    const result = resolveActiveBusiness([], null);
    expect(result).toEqual({ id: null, needsRecovery: false });
  });
});
