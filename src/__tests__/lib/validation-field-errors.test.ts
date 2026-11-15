/**
 * Beta integrity BIV-07/08: field-level validation issues must survive from the
 * validation layer, through the canonical wrapper's 4xx body, to the client error
 * object — so a form can mark the exact field instead of a generic banner.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { parseOrThrow, parseRequestBody } from "@/lib/validation";
import { extractSafeFieldErrors } from "@/lib/canonical-route-enforcement";
import { httpResponseErrorFromBody, fieldErrorMap, HttpResponseError } from "@/lib/operator-safe-errors";
import { ValidationError } from "@/infra/errors";

const schema = z.object({
  periodStart: z.string().min(1, "Reporting period start is required"),
  amount: z.number().positive(),
});

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected throw");
}

describe("validation → fieldErrors", () => {
  it("parseOrThrow attaches one {path, message} per zod issue", () => {
    const err = thrown(() => parseOrThrow(schema, { periodStart: "", amount: -1 })) as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe("Validation failed");
    expect(err.details?.fieldErrors).toEqual([
      { path: "periodStart", message: "Reporting period start is required" },
      { path: "amount", message: expect.any(String) },
    ]);
  });

  it("parseRequestBody reports unknown fields per field", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ periodStart: "a", amount: 1, bogus: 1 }) });
    await expect(parseRequestBody(req, schema)).rejects.toMatchObject({
      details: { fieldErrors: [{ path: "bogus", message: "Unknown field" }] },
    });
  });

  it("the wrapper exposes only well-formed, bounded {path, message} pairs", () => {
    const err = new ValidationError("Validation failed", {
      errors: "internal prettified text",
      fieldErrors: [
        { path: "periodStart", message: "required" },
        { path: 1, message: "not a string path" },
        { path: "x", message: "y", stack: "leak" },
        "garbage",
      ],
    });
    expect(extractSafeFieldErrors(err)).toEqual([
      { path: "periodStart", message: "required" },
      { path: "x", message: "y" },
    ]);
    expect(extractSafeFieldErrors(new Error("raw"))).toEqual([]);
  });

  it("the client error carries the field errors and maps them by path", () => {
    const err = httpResponseErrorFromBody(400, {
      error: "Validation failed",
      fieldErrors: [{ path: "periodEnd", message: "Reporting period end is required" }],
    });
    expect(err).toBeInstanceOf(HttpResponseError);
    expect(err.fieldErrors).toHaveLength(1);
    expect(fieldErrorMap(err)).toEqual({ periodEnd: "Reporting period end is required" });
    expect(fieldErrorMap(new Error("plain"))).toEqual({});
  });
});
