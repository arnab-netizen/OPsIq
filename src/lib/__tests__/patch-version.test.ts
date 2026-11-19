import { describe, it, expect } from "vitest";
import { versionAfterPatch } from "@/lib/patch-version";

/**
 * Root cause: the Action Center and Recommendations Manager stored `(updated.version || version) + 1`
 * after a successful PATCH. The server already returns the incremented version, so the client held a
 * version one ahead of the row and its next PATCH was refused with 409 (stale version).
 */
describe("versionAfterPatch", () => {
  it("uses the version the server returned (already incremented)", () => {
    expect(versionAfterPatch({ version: 2 }, 1)).toBe(2);
    expect(versionAfterPatch({ version: 7 }, 1)).toBe(7);
  });

  it("falls back to sent + 1 only when the response carries no numeric version", () => {
    expect(versionAfterPatch({}, 3)).toBe(4);
    expect(versionAfterPatch(null, 3)).toBe(4);
    expect(versionAfterPatch({ version: "2" }, 3)).toBe(4);
  });
});
