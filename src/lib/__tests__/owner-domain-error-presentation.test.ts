/**
 * Direct unit tests for `presentDomainError` (src/lib/owner-domain-error-presentation.ts).
 *
 * ROOT_CAUSE this closes (see the module's own header comment for the full account): the
 * Strategy/Recovery/Marketing/Cashflow pages' local `api()` helper discarded the real HTTP status
 * code and derived owner-facing text by guessing keywords in the raw server message. That let a
 * 5xx response whose body happened to contain "invalid"/"validation" render as a user-input
 * problem, and separately let a genuine `NotFoundError("<ModelName>", <uuid>)` -- a real, reachable
 * shape thrown by every one of these domains' action/verification services -- reach the owner as
 * raw internal-model-name-plus-UUID text.
 *
 * Fixtures below are labeled REALISTIC (traced to an actual call site reachable through
 * `withCanonicalEnforcement`, see src/lib/canonical-route-enforcement.ts) or SYNTHETIC/DEFENSIVE
 * (a shape these routes cannot currently produce, exercised only to prove the 5xx-never-inspects-
 * body rule holds regardless of what the body says).
 */
import { describe, it, expect } from "vitest";
import { presentDomainError } from "@/lib/owner-domain-error-presentation";
import { httpResponseErrorFromBody } from "@/lib/operator-safe-errors";

const LEAKY_UUID = "123e4567-e89b-12d3-a456-426614174000";

function assertNoLeak(message: string) {
  expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(message).not.toMatch(/prisma/i);
  expect(message).not.toMatch(/invocation/i);
  expect(message).not.toMatch(/completionNotes|completionEvidence|actualOutcome/i);
  expect(message).not.toMatch(/OwnerStrategyAction|RecoveryAction|OwnerMarketingAction|OwnerCashflowAction/i);
  expect(message).not.toMatch(/stack trace/i);
  expect(message).not.toMatch(/not found:/i);
  expect(message.trim().length).toBeGreaterThan(0);
}

describe("presentDomainError — status precedence (Rule 1)", () => {
  it("REALISTIC: the actual withCanonicalEnforcement 5xx fallback body is still shown via this module's own fallback, not passed through verbatim", () => {
    // This is genuinely what these routes send today for any unclassified/raw 500
    // (canonical-route-enforcement.ts's catch block, isKnownSafeClientError === false).
    const err = httpResponseErrorFromBody(500, { error: "Something went wrong on our side. Nothing was saved. Please try again." });
    const message = presentDomainError(err, "load");
    assertNoLeak(message);
    // Never assert the "nothing was saved" guarantee ourselves (Rule 4) -- even though the
    // server's own fallback text says it, this module does not repeat unverified assurances.
    expect(message).not.toMatch(/nothing was saved/i);
  });

  it("SYNTHETIC/DEFENSIVE: a 500 whose body text contains 'Invalid invocation' (Prisma-style) never becomes a validation message", () => {
    const err = httpResponseErrorFromBody(500, { error: "Invalid `db.ownerStrategyAction.update()` invocation in /app/src/services/owner-strategy/action.service.ts:42:10" });
    const message = presentDomainError(err, "action");
    assertNoLeak(message);
    expect(message).not.toMatch(/check your entries|didn.t look right/i);
    expect(message).toBe("Couldn't complete this action. Please try again.");
  });

  it("SYNTHETIC/DEFENSIVE: a 500 whose body text says 'Validation failed' verbatim (matches a real 4xx allowlist pattern) is still never treated as a validation message at 5xx", () => {
    const err = httpResponseErrorFromBody(500, { error: "Validation failed" });
    const message = presentDomainError(err, "save");
    expect(message).toBe("Couldn't save your changes. Please try again.");
  });

  it("REALISTIC: a 502/503/504 (infra-layer failures) fall to the same generic 5xx fallback", () => {
    for (const status of [502, 503, 504]) {
      const err = httpResponseErrorFromBody(status, {});
      expect(presentDomainError(err, "load")).toBe("Couldn't load that information. Please refresh and try again.");
    }
  });
});

describe("presentDomainError — known 4xx message allowlist (Rule 2 & 3)", () => {
  it("REALISTIC: generic ValidationError('Validation failed') from parseOrThrow", () => {
    const err = httpResponseErrorFromBody(400, { error: "Validation failed" });
    expect(presentDomainError(err, "save")).toBe("That didn't look right. Please check your entries and try again.");
  });

  it("REALISTIC: 'Invalid JSON in request body' from parseRequestBody", () => {
    const err = httpResponseErrorFromBody(400, { error: "Invalid JSON in request body" });
    expect(presentDomainError(err, "save")).toBe("That didn't look right. Please check your entries and try again.");
  });

  it("REALISTIC: 'Unknown fields in request body' from parseRequestBody", () => {
    const err = httpResponseErrorFromBody(400, { error: "Unknown fields in request body" });
    expect(presentDomainError(err, "save")).toBe("That didn't look right. Please check your entries and try again.");
  });

  it.each(["strategy", "recovery", "marketing", "cashflow"])(
    "REALISTIC: 'Invalid %s action status: <value>' from action.service.ts",
    (domain) => {
      const err = httpResponseErrorFromBody(400, { error: `Invalid ${domain} action status: bogus` });
      const message = presentDomainError(err, "action");
      expect(message).toBe("That status isn't recognized. Please refresh and try again.");
      expect(message).not.toMatch(/bogus/);
    }
  );

  it.each(["strategy", "recovery", "marketing", "cashflow"])(
    "REALISTIC: 'Invalid %s action transition: <from> → <to>' from action.service.ts",
    (domain) => {
      const err = httpResponseErrorFromBody(400, { error: `Invalid ${domain} action transition: completed → pending` });
      const message = presentDomainError(err, "action");
      expect(message).toBe("That action can't move to the requested status from its current one. Refresh to see its latest status.");
      expect(message).not.toMatch(/completed|pending/);
    }
  );

  it("REALISTIC: Strategy/Marketing/Cashflow completion requirement never repeats 'completionNotes'/'completionEvidence'", () => {
    for (const domain of ["strategy", "marketing", "cashflow"]) {
      const err = httpResponseErrorFromBody(400, {
        error: `Completing a ${domain} action requires completionNotes and completionEvidence.`,
      });
      const message = presentDomainError(err, "action");
      expect(message).toBe("Add the required completion details before marking this complete.");
      assertNoLeak(message);
    }
  });

  it("REALISTIC: Recovery's completion requirement uses 'actualOutcome' (not 'completionEvidence') and is still paraphrased identically", () => {
    const err = httpResponseErrorFromBody(400, {
      error: "Completing a recovery action requires completionNotes and actualOutcome.",
    });
    const message = presentDomainError(err, "action");
    expect(message).toBe("Add the required completion details before marking this complete.");
    assertNoLeak(message);
  });

  it("REALISTIC: Strategy/Marketing/Cashflow baseline-verification message ('before (baseline) value')", () => {
    for (const domain of ["strategy", "marketing", "cashflow"]) {
      const err = httpResponseErrorFromBody(400, {
        error: `Cannot verify a ${domain} action without a before (baseline) value for the metric.`,
      });
      expect(presentDomainError(err, "action")).toBe(
        "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one."
      );
    }
  });

  it("REALISTIC: Recovery's differently-worded baseline-verification message is still recognized", () => {
    const err = httpResponseErrorFromBody(400, {
      error: "Cannot verify an action without a baseline metric value. Re-run diagnosis to capture a baseline.",
    });
    expect(presentDomainError(err, "action")).toBe(
      "This action doesn't have a baseline value to verify against yet. Run diagnosis again to capture one."
    );
  });
});

describe("presentDomainError — entity/identifier leaks (Rule 3, NotFoundError)", () => {
  it.each([
    ["OwnerStrategyAction", "strategy"],
    ["RecoveryAction", "recovery"],
    ["OwnerMarketingAction", "marketing"],
    ["OwnerCashflowAction", "cashflow"],
  ])("REALISTIC: a 404 NotFoundError(%s, uuid) from %s's action/verification/snapshot service never leaks the model name or UUID", (entity) => {
    const err = httpResponseErrorFromBody(404, { error: `${entity} not found: ${LEAKY_UUID}` });
    const message = presentDomainError(err, "action");
    assertNoLeak(message);
    expect(message).toBe(
      "That item couldn't be found. It may have been removed or updated elsewhere. Please refresh and try again."
    );
  });

  it("SYNTHETIC/DEFENSIVE: an arbitrary unrecognized entity name + UUID shape (not one of the 4 known models) is still caught by the generic 'not found:' pattern", () => {
    const err = httpResponseErrorFromBody(404, { error: `SomeFutureModel not found: ${LEAKY_UUID}` });
    const message = presentDomainError(err, "load");
    assertNoLeak(message);
  });
});

describe("presentDomainError — auth/permission (Rules 3 & 4)", () => {
  it("REALISTIC: 401 always gets neutral sign-in guidance, never an assumed 'session expired' framing", () => {
    const err = httpResponseErrorFromBody(401, { error: "Unauthorized" });
    expect(presentDomainError(err, "load")).toBe("Please sign in to continue.");
  });

  it("REALISTIC: 401 with no body at all still gets the same neutral guidance", () => {
    const err = httpResponseErrorFromBody(401, {});
    expect(presentDomainError(err, "action")).toBe("Please sign in to continue.");
  });

  it("REALISTIC: 403 'Insufficient permissions' (translateAuthDecisionToResponse) falls to the generic permission message", () => {
    const err = httpResponseErrorFromBody(403, { error: "Insufficient permissions" });
    expect(presentDomainError(err, "action")).toBe("You don't have permission to do this.");
  });

  it("REALISTIC: 403 'Workspace required' (translateAuthDecisionToResponse) gets the dedicated workspace message", () => {
    const err = httpResponseErrorFromBody(403, { error: "Workspace required" });
    expect(presentDomainError(err, "load")).toBe("This isn't available for your current workspace.");
  });

  it("SYNTHETIC/DEFENSIVE: an unrecognized 403 body text falls to the generic permission message, never shown verbatim", () => {
    const err = httpResponseErrorFromBody(403, { error: "Access denied: role=STAFF lacks OWNER_MANAGE" });
    const message = presentDomainError(err, "action");
    expect(message).toBe("You don't have permission to do this.");
    expect(message).not.toMatch(/STAFF|OWNER_MANAGE/);
  });
});

describe("presentDomainError — unknown/unrecognized responses fall to safe fallback (Rule 2)", () => {
  it("SYNTHETIC/DEFENSIVE: a 400 with body text matching no allowlist entry never renders verbatim", () => {
    const err = httpResponseErrorFromBody(400, { error: "Some brand-new validation rule the client has never seen" });
    const message = presentDomainError(err, "save");
    expect(message).toBe("Couldn't save your changes. Please try again.");
  });

  it("SYNTHETIC/DEFENSIVE: a 409/422 with no recognized pattern falls to the generic fallback for its context", () => {
    for (const status of [409, 422]) {
      const err = httpResponseErrorFromBody(status, { error: "Unrecognized conflict shape" });
      expect(presentDomainError(err, "action")).toBe("Couldn't complete this action. Please try again.");
    }
  });
});

describe("presentDomainError — malformed / empty bodies", () => {
  it("empty object body on a 4xx has no server message and falls to the generic fallback", () => {
    const err = httpResponseErrorFromBody(400, {});
    expect(presentDomainError(err, "save")).toBe("Couldn't save your changes. Please try again.");
  });

  it("null body on a 4xx falls to the generic fallback", () => {
    const err = httpResponseErrorFromBody(400, null);
    expect(presentDomainError(err, "load")).toBe("Couldn't load that information. Please refresh and try again.");
  });

  it("body.error is an empty/whitespace string: treated as no server message (hasServerMessage=false)", () => {
    const err = httpResponseErrorFromBody(400, { error: "   " });
    expect(err.hasServerMessage).toBe(false);
    expect(presentDomainError(err, "action")).toBe("Couldn't complete this action. Please try again.");
  });

  it("body.error is not a string (an object, the ClassifiedApiError-era shape callers must not assume): ignored, not stringified into the message", () => {
    const err = httpResponseErrorFromBody(400, { error: { message: "nested shape" } });
    expect(err.hasServerMessage).toBe(false);
    const message = presentDomainError(err, "save");
    expect(message).not.toMatch(/nested shape/);
    expect(message).toBe("Couldn't save your changes. Please try again.");
  });

  it("body is a non-object primitive (malformed JSON parse result): falls to the generic fallback", () => {
    const err = httpResponseErrorFromBody(400, "just a string body");
    expect(presentDomainError(err, "load")).toBe("Couldn't load that information. Please refresh and try again.");
  });
});

describe("presentDomainError — no HTTP response at all (Rule 5)", () => {
  it("a genuine fetch() rejection (TypeError, no Response object) gets connectivity guidance without claiming an active check/retry", () => {
    const message = presentDomainError(new TypeError("Failed to fetch"), "load");
    expect(message).toBe("Couldn't connect to the server. Check your internet connection and try again.");
    expect(message).not.toMatch(/checking|automatically retry|we are retrying/i);
  });

  it("a non-Error thrown value (string) is treated the same as a connectivity failure, not classified as a status", () => {
    const message = presentDomainError("some raw thrown string", "action");
    expect(message).toBe("Couldn't connect to the server. Check your internet connection and try again.");
  });

  it("undefined/null thrown values do not crash and fall to the same connectivity fallback", () => {
    expect(presentDomainError(undefined, "save")).toBe(
      "Couldn't connect to the server. Check your internet connection and try again."
    );
    expect(presentDomainError(null, "save")).toBe(
      "Couldn't connect to the server. Check your internet connection and try again."
    );
  });
});

describe("presentDomainError — context-appropriate fallback selection", () => {
  it("uses the load/save/action fallback matching the passed context, not a one-size-fits-all string", () => {
    const err = httpResponseErrorFromBody(500, {});
    expect(presentDomainError(err, "load")).toBe("Couldn't load that information. Please refresh and try again.");
    expect(presentDomainError(err, "save")).toBe("Couldn't save your changes. Please try again.");
    expect(presentDomainError(err, "action")).toBe("Couldn't complete this action. Please try again.");
  });
});
