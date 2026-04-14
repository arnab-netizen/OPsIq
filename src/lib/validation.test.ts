import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { parseOrThrow, parseSearchParams, paginationSchema } from "./validation";
import { ValidationError } from "@/infra/errors";

describe("Validation utilities", () => {
  describe("parseOrThrow", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().min(0),
    });

    it("returns parsed data for valid input", () => {
      const result = parseOrThrow(schema, { name: "Alice", age: 30 });
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("throws ValidationError for invalid input", () => {
      expect(() => parseOrThrow(schema, { name: "", age: -1 })).toThrow(
        ValidationError
      );
    });

    it("throws ValidationError for missing fields", () => {
      expect(() => parseOrThrow(schema, {})).toThrow(ValidationError);
    });

    it("throws ValidationError for wrong types", () => {
      expect(() => parseOrThrow(schema, { name: 123, age: "thirty" })).toThrow(
        ValidationError
      );
    });
  });

  describe("paginationSchema", () => {
    it("uses defaults for missing values", () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(0);
    });

    it("coerces string values", () => {
      const result = paginationSchema.parse({ limit: "10", offset: "5" });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it("clamps limit to max 100", () => {
      expect(() => paginationSchema.parse({ limit: "200" })).toThrow();
    });

    it("rejects negative offset", () => {
      expect(() => paginationSchema.parse({ offset: "-1" })).toThrow();
    });
  });

  describe("parseSearchParams", () => {
    const schema = z.object({
      q: z.string().optional(),
      page: z.coerce.number().int().default(1),
    });

    it("parses valid URL params", () => {
      const result = parseSearchParams(
        "http://localhost:3000/api?q=test&page=2",
        schema
      );
      expect(result.q).toBe("test");
      expect(result.page).toBe(2);
    });

    it("uses defaults for missing params", () => {
      const result = parseSearchParams(
        "http://localhost:3000/api",
        schema
      );
      expect(result.page).toBe(1);
    });
  });
});
