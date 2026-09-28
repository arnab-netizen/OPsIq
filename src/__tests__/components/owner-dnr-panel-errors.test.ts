/**
 * OwnerDoNotRepeatPanel — a refused or failed save is shown through the operator-safe path: a named refusal
 * by its OWN owner text (never the server's text), any other failure by the governed classification (never a
 * raw server message). Governance: no raw `err.message` is rendered (governance-scan raw-error-message).
 */
import { describe, it, expect } from "vitest";
import { ownerDnrErrorFromResponse, ownerDnrSaveErrorText } from "@/components/owner/OwnerDoNotRepeatPanel";
import { MIN_CHANGED_CONTEXT_LENGTH } from "@/domain/owner-mode/decision-memory";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

describe("OwnerDoNotRepeatPanel save errors", () => {
  it("a refused save (422 with a stable code) shows the code's own actionable text, never the server's words", () => {
    const text = ownerDnrSaveErrorText(ownerDnrErrorFromResponse(422, { code: "REASON_TOO_SHORT", error: "internal: reason len 3 < 20 (rule 9f)" }));
    expect(text).toBe(`Describe what has changed in at least ${MIN_CHANGED_CONTEXT_LENGTH} characters.`);
    expect(ownerDnrSaveErrorText(ownerDnrErrorFromResponse(422, { code: "ALREADY_RECORDED" }))).toMatch(/already recorded/);
    expect(ownerDnrSaveErrorText(ownerDnrErrorFromResponse(422, { code: "RULE_INACTIVE" }))).toMatch(/no longer active/);
  });
  it("any other failure is classified operator-safe: a raw server message never reaches the owner", () => {
    const raw = "PrismaClientKnownRequestError at db-internal-host:5432 constraint owner_dnr_override_pkey";
    for (const status of [500, 409, 403]) {
      const text = ownerDnrSaveErrorText(ownerDnrErrorFromResponse(status, { error: { message: raw } }));
      expect(text).toBeTruthy();
      expect(text).not.toContain("Prisma");
      expect(text).not.toContain("db-internal-host");
    }
    // A validation refusal without a known code goes through the SAME canonical path (toOperatorSafeError):
    // the panel never renders an error's message itself.
    const err = ownerDnrErrorFromResponse(422, { code: "UNKNOWN_CODE", error: "Describe the change." });
    expect(ownerDnrSaveErrorText(err)).toBe(toOperatorSafeError(err, "save").error);
  });
});
