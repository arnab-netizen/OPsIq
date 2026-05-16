/**
 * Tests: Request Validation Middleware
 *
 * Validates request body, query parameters, and headers validation
 * with proper error categorization and type safety.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateRequest,
  withRequestValidation,
  parseRequestBody,
  parseQueryParams,
  parseHeaders,
  formatValidationErrors,
} from "@/middleware/request-validation";

describe("Request Validation Middleware", () => {
  describe("Validate Request Body", () => {
    it("should validate valid request body", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "John", age: 30 }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid request body", async () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "John", age: "thirty" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].field).toBe("age");
      }
    });

    it("should reject missing required fields", async () => {
      const schema = z.object({ name: z.string().min(1), email: z.string().email() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "John" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.field === "email")).toBe(true);
      }
    });

    it("should support nested object validation", async () => {
      const schema = z.object({
        user: z.object({ name: z.string(), email: z.string().email() }),
        role: z.enum(["admin", "user"]),
      });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({
          user: { name: "John", email: "john@example.com" },
          role: "admin",
        }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should validate string constraints", async () => {
      const schema = z.object({ password: z.string().min(8) });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ password: "short" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(false);
    });

    it("should validate number ranges", async () => {
      const schema = z.object({ age: z.number().min(0).max(150) });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ age: 200 }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(false);
    });

    it("should validate enums", async () => {
      const schema = z.object({ status: z.enum(["active", "inactive"]) });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ status: "pending" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(false);
    });

    it("should allow optional fields", async () => {
      const schema = z.object({ name: z.string(), email: z.string().optional() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "John" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should support array validation", async () => {
      const schema = z.object({ tags: z.array(z.string()) });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ tags: ["tag1", "tag2"] }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });
  });

  describe("Validate Query Parameters", () => {
    it("should validate valid query parameters", async () => {
      const schema = z.object({ page: z.string(), limit: z.string() });
      const request = new NextRequest("http://localhost/api/test?page=1&limit=10");

      const result = await validateRequest(request, { query: schema });
      expect(result.valid).toBe(true);
    });

    it("should reject missing required parameters", async () => {
      const schema = z.object({ page: z.string(), limit: z.string() });
      const request = new NextRequest("http://localhost/api/test?page=1");

      const result = await validateRequest(request, { query: schema });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some((e) => e.field.includes("limit"))).toBe(true);
      }
    });

    it("should allow optional query parameters", async () => {
      const schema = z.object({ search: z.string().optional(), sort: z.string().optional() });
      const request = new NextRequest("http://localhost/api/test?search=test");

      const result = await validateRequest(request, { query: schema });
      expect(result.valid).toBe(true);
    });

    it("should ignore extra query parameters", async () => {
      const schema = z.object({ page: z.string() }).passthrough();
      const request = new NextRequest("http://localhost/api/test?page=1&extra=param");

      const result = await validateRequest(request, { query: schema });
      expect(result.valid).toBe(true);
    });

    it("should validate query parameter format", async () => {
      const schema = z.object({ id: z.string().uuid() });
      const request = new NextRequest("http://localhost/api/test?id=invalid");

      const result = await validateRequest(request, { query: schema });
      expect(result.valid).toBe(false);
    });
  });

  describe("Validate Headers", () => {
    it("should validate valid headers", async () => {
      const schema = z.object({
        "content-type": z.string(),
        authorization: z.string().optional(),
      });
      const request = new NextRequest("http://localhost/api/test", {
        headers: { "content-type": "application/json" },
      });

      const result = await validateRequest(request, { headers: schema });
      expect(result.valid).toBe(true);
    });

    it("should validate required headers", async () => {
      const schema = z.object({ authorization: z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        headers: { "content-type": "application/json" },
      });

      const result = await validateRequest(request, { headers: schema });
      expect(result.valid).toBe(false);
    });

    it("should validate header format", async () => {
      const schema = z.object({ authorization: z.string().regex(/^Bearer /) });
      const request = new NextRequest("http://localhost/api/test", {
        headers: { authorization: "InvalidFormat" },
      });

      const result = await validateRequest(request, { headers: schema });
      expect(result.valid).toBe(false);
    });
  });

  describe("Combined Validation", () => {
    it("should validate body and query together", async () => {
      const schemas = {
        body: z.object({ name: z.string() }),
        query: z.object({ id: z.string() }),
      };
      const request = new NextRequest("http://localhost/api/test?id=123", {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      });

      const result = await validateRequest(request, schemas);
      expect(result.valid).toBe(true);
    });

    it("should report all validation errors", async () => {
      const schemas = {
        body: z.object({ name: z.string().min(1) }),
        query: z.object({ id: z.string().uuid() }),
      };
      const request = new NextRequest("http://localhost/api/test?id=invalid", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });

      const result = await validateRequest(request, schemas);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });

  describe("Parse Request Body", () => {
    it("should parse and return typed data", async () => {
      const schema = z.object({ id: z.number(), name: z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ id: 1, name: "Test" }),
      });

      const result = await parseRequestBody<{ id: number; name: string }>(request, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.name).toBe("Test");
      }
    });

    it("should return error details on failure", async () => {
      const schema = z.object({ id: z.number() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ id: "not-a-number" }),
      });

      const result = await parseRequestBody(request, schema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.length).toBeGreaterThan(0);
        expect(result.error[0].code).toBeDefined();
      }
    });

    it("should handle invalid JSON", async () => {
      const schema = z.object({ name: z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: "invalid json {",
      });

      const result = await parseRequestBody(request, schema);
      expect(result.success).toBe(false);
    });
  });

  describe("Parse Query Parameters", () => {
    it("should parse and return typed query params", () => {
      const schema = z.object({ page: z.coerce.number(), limit: z.coerce.number() });
      const request = new NextRequest("http://localhost/api/test?page=1&limit=10");

      const result = parseQueryParams<{ page: number; limit: number }>(request, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
      }
    });

    it("should coerce string to number", () => {
      const schema = z.object({ id: z.coerce.number() });
      const request = new NextRequest("http://localhost/api/test?id=123");

      const result = parseQueryParams<{ id: number }>(request, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.id).toBe("number");
      }
    });

    it("should handle coercion failure", () => {
      const schema = z.object({ id: z.coerce.number() });
      const request = new NextRequest("http://localhost/api/test?id=not-a-number");

      const result = parseQueryParams(request, schema);
      expect(result.success).toBe(false);
    });
  });

  describe("Parse Headers", () => {
    it("should parse and return typed headers", () => {
      const schema = z.object({ "x-custom-header": z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        headers: { "x-custom-header": "custom-value" },
      });

      const result = parseHeaders<{ "x-custom-header": string }>(request, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data["x-custom-header"]).toBe("custom-value");
      }
    });

    it("should handle case-insensitive header lookup", () => {
      const schema = z.object({ "content-type": z.string().optional() });
      const request = new NextRequest("http://localhost/api/test", {
        headers: { "Content-Type": "application/json" },
      });

      const result = parseHeaders(request, schema);
      expect(result.success).toBe(true);
    });
  });

  describe("Error Formatting", () => {
    it("should format Zod errors properly", () => {
      const schema = z.object({ name: z.string().min(1), age: z.number() });
      const error = schema.safeParse({ name: "", age: "invalid" });

      if (!error.success) {
        const formatted = formatValidationErrors(error.error);
        expect(formatted.code).toBe("VALIDATION_ERROR");
        expect(formatted.errors.length).toBeGreaterThan(0);
        expect(formatted.errors[0].field).toBeDefined();
        expect(formatted.errors[0].message).toBeDefined();
      }
    });

    it("should include field paths in errors", () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({ name: z.string() }),
        }),
      });
      const error = schema.safeParse({ user: { profile: { name: 123 } } });

      if (!error.success) {
        const formatted = formatValidationErrors(error.error);
        expect(formatted.errors[0].field).toContain("user");
        expect(formatted.errors[0].field).toContain("profile");
      }
    });
  });

  describe("Middleware Wrapper", () => {
    it("should reject invalid requests", async () => {
      const schema = z.object({ name: z.string() });
      const handler = async () => NextResponse.json({ success: true });
      const wrapped = withRequestValidation(handler, { body: schema });

      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: 123 }),
      });

      const response = await wrapped(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("should pass valid requests to handler", async () => {
      const schema = z.object({ name: z.string() });
      const handler = async () => NextResponse.json({ success: true });
      const wrapped = withRequestValidation(handler, { body: schema });

      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      });

      const response = await wrapped(request);
      expect(response.status).toBe(200);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty request body", async () => {
      const schema = z.object({}).strict();
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should handle no query parameters", () => {
      const schema = z.object({ id: z.string().optional() });
      const request = new NextRequest("http://localhost/api/test");

      const result = parseQueryParams(request, schema);
      expect(result.success).toBe(true);
    });

    it("should provide meaningful error messages", async () => {
      const schema = z.object({
        email: z.string().email("Invalid email format"),
      });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      });

      const result = await parseRequestBody(request, schema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error[0].message).toContain("email");
      }
    });

    it("should handle special characters in values", async () => {
      const schema = z.object({ text: z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ text: 'Special chars: !@#$%^&*() "quotes"' }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should handle unicode characters", async () => {
      const schema = z.object({ text: z.string() });
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ text: "Unicode: 你好世界 🌍" }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });

    it("should handle very large payloads", async () => {
      const schema = z.object({ data: z.string() });
      const largeString = "x".repeat(10000);
      const request = new NextRequest("http://localhost/api/test", {
        method: "POST",
        body: JSON.stringify({ data: largeString }),
      });

      const result = await validateRequest(request, { body: schema });
      expect(result.valid).toBe(true);
    });
  });
});
