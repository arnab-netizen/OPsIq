import { describe, it, expect } from "vitest";
import {
  QBO_READABLE_ENTITIES,
  buildQboQuery,
  buildQboCountQuery,
  QBO_QUERY_IN_MAX_VALUES,
  isReadableEntity,
  isReportName,
  quoteQboLiteral,
  validateReportParams,
} from "@/domain/quickbooks/qbo-read-catalog";

describe("buildQboQuery", () => {
  it("builds a paginated SELECT with escaped literals", () => {
    expect(
      buildQboQuery({
        entity: "Invoice",
        where: [{ field: "MetaData.LastUpdatedTime", op: ">", value: "2026-01-01T00:00:00Z" }, { field: "Balance", op: ">", value: 0 }],
        orderBy: { field: "Id" },
        startPosition: 1001,
        maxResults: 500,
      }),
    ).toBe("SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime > '2026-01-01T00:00:00Z' AND Balance > 0 ORDERBY Id STARTPOSITION 1001 MAXRESULTS 500");
  });

  it("defaults to the first page at Intuit's maximum page size", () => {
    expect(buildQboQuery({ entity: "Customer" })).toBe("SELECT * FROM Customer STARTPOSITION 1 MAXRESULTS 1000");
  });

  it("rejects an entity outside the readable allowlist (no arbitrary tables / write entities)", () => {
    // @ts-expect-error deliberately invalid
    expect(() => buildQboQuery({ entity: "Invoice; DELETE FROM Invoice" })).toThrow(RangeError);
    // @ts-expect-error deliberately invalid
    expect(() => buildQboQuery({ entity: "Employee" })).toThrow(RangeError);
  });

  it("rejects injection through fields, operators and page bounds", () => {
    expect(() => buildQboQuery({ entity: "Invoice", where: [{ field: "Id; DROP", op: "=", value: 1 }] })).toThrow(RangeError);
    // @ts-expect-error deliberately invalid
    expect(() => buildQboQuery({ entity: "Invoice", where: [{ field: "Id", op: "OR 1=1 --", value: 1 }] })).toThrow(RangeError);
    expect(() => buildQboQuery({ entity: "Invoice", orderBy: { field: "Id DESC; --" } })).toThrow(RangeError);
    expect(() => buildQboQuery({ entity: "Invoice", maxResults: 1001 })).toThrow(RangeError);
    expect(() => buildQboQuery({ entity: "Invoice", maxResults: 0 })).toThrow(RangeError);
    expect(() => buildQboQuery({ entity: "Invoice", startPosition: 0 })).toThrow(RangeError);
    expect(() => buildQboQuery({ entity: "Invoice", startPosition: 1.5 })).toThrow(RangeError);
  });
});

describe("quoteQboLiteral", () => {
  it("escapes quotes and backslashes so a value cannot terminate the literal", () => {
    expect(quoteQboLiteral("O'Brien")).toBe("'O\\'Brien'");
    expect(quoteQboLiteral("a\\' OR Id != '")).toBe("'a\\\\\\' OR Id != \\''");
    expect(quoteQboLiteral(12.5)).toBe("12.5");
    expect(quoteQboLiteral(true)).toBe("true");
  });
  it("rejects control characters, non-finite numbers and oversize strings", () => {
    expect(() => quoteQboLiteral("a\nb")).toThrow(RangeError);
    expect(() => quoteQboLiteral(Number.NaN)).toThrow(RangeError);
    expect(() => quoteQboLiteral(Infinity)).toThrow(RangeError);
    expect(() => quoteQboLiteral("x".repeat(257))).toThrow(RangeError);
  });
});

describe("allowlists", () => {
  it("IN takes a bounded parenthesised list of escaped literals (identity-inclusion proofs); count(*) shares the grammar", () => {
    expect(buildQboCountQuery({ entity: "Invoice", where: [{ field: "Id", op: "IN", value: ["1", "2"] }] })).toBe("SELECT count(*) FROM Invoice WHERE Id IN ('1', '2')");
    expect(buildQboQuery({ entity: "Invoice", where: [{ field: "Id", op: "IN", value: ["a'b"] }] })).toContain("Id IN ('a\\'b')");
    const many = Array.from({ length: QBO_QUERY_IN_MAX_VALUES + 1 }, (_, i) => String(i));
    expect(() => buildQboCountQuery({ entity: "Invoice", where: [{ field: "Id", op: "IN", value: many }] })).toThrow(RangeError);
    expect(() => buildQboCountQuery({ entity: "Invoice", where: [{ field: "Id", op: "IN", value: [] }] })).toThrow(RangeError);
    expect(() => buildQboCountQuery({ entity: "Invoice", where: [{ field: "Id", op: "=", value: ["1"] as never }] })).toThrow(RangeError);
    expect(() => buildQboCountQuery({ entity: "Invoice", where: [{ field: "Id) OR (1", op: "IN", value: ["1"] }] })).toThrow(RangeError);
  });

  it("entities and reports are fixed sets", () => {
    expect(isReadableEntity("Invoice")).toBe(true);
    expect(isReadableEntity("invoice")).toBe(false);
    expect(isReadableEntity("../x")).toBe(false);
    expect(QBO_READABLE_ENTITIES).not.toContain("Employee");
    expect(isReportName("ProfitAndLoss")).toBe(true);
    expect(isReportName("../../admin")).toBe(false);
  });
  it("report params: allowlisted keys and safe values only", () => {
    expect(validateReportParams({ start_date: "2026-01-01", end_date: "2026-01-31", accounting_method: "Accrual" })).toEqual({
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      accounting_method: "Accrual",
    });
    // @ts-expect-error deliberately invalid
    expect(() => validateReportParams({ evil: "1" })).toThrow(RangeError);
    expect(() => validateReportParams({ start_date: "2026-01-01&x=1" })).toThrow(RangeError);
    expect(() => validateReportParams({ start_date: "a b" })).toThrow(RangeError);
    // minorversion is owned by the client config, never the caller
    expect(() => validateReportParams({ minorversion: "1" })).toThrow(RangeError);
  });
});
