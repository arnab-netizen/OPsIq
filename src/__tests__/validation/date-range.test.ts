import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { endNotBeforeStart } from "@/validation/date-range";

const schema = z.object({ startDate: z.coerce.date(), endDate: z.coerce.date().nullable().optional() }).superRefine(endNotBeforeStart("startDate", "endDate", "End must be on or after the start"));

describe("end not before start", () => {
  it("refuses an end before its start, on the end field", () => {
    const r = schema.safeParse({ startDate: "2026-09-30", endDate: "2026-09-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ["endDate"], message: "End must be on or after the start" });
  });
  it("accepts equal dates, a later end, and an absent or null end", () => {
    expect(schema.safeParse({ startDate: "2026-09-01", endDate: "2026-09-01" }).success).toBe(true);
    expect(schema.safeParse({ startDate: "2026-09-01", endDate: "2026-10-01" }).success).toBe(true);
    expect(schema.safeParse({ startDate: "2026-09-01" }).success).toBe(true);
    expect(schema.safeParse({ startDate: "2026-09-01", endDate: null }).success).toBe(true);
  });
});
