import { describe, it, expect } from "vitest";
import {
  QBO_ENTITY_ID_MAX_LENGTH,
  QBO_ENTITY_ID_MAX_LENGTH_SOURCE,
  QBO_REALM_ID_MAX_LENGTH,
  QBO_REALM_ID_MAX_LENGTH_SOURCE,
  encodePathSegment,
  isSafeEntityId,
  isValidRealmId,
} from "@/domain/quickbooks/qbo-identifiers";

describe("bound provenance", () => {
  it("both length limits are OpsIQ defensive bounds, not Intuit-documented maximums", () => {
    expect(QBO_ENTITY_ID_MAX_LENGTH_SOURCE).toBe("OPSIQ_DEFENSIVE_BOUND");
    expect(QBO_REALM_ID_MAX_LENGTH_SOURCE).toBe("OPSIQ_DEFENSIVE_BOUND");
    expect(QBO_ENTITY_ID_MAX_LENGTH).not.toBe(20);
    expect(QBO_REALM_ID_MAX_LENGTH).not.toBe(20);
  });
});

describe("realm id", () => {
  it("accepts normal current ids unchanged", () => {
    for (const ok of ["9341456924700058", "9130357000000001", "1234567890", "123"]) expect(isValidRealmId(ok)).toBe(true);
  });
  it("is not capped at the old 20 digits: longer numeric ids pass up to the defensive bound only", () => {
    expect(isValidRealmId("1".repeat(21))).toBe(true);
    expect(isValidRealmId("1".repeat(QBO_REALM_ID_MAX_LENGTH))).toBe(true);
    expect(isValidRealmId("1".repeat(QBO_REALM_ID_MAX_LENGTH + 1))).toBe(false);
  });
  it("stays strictly numeric: no separators, markers, encodings, whitespace or control characters", () => {
    for (const bad of ["", " ", "12 34", "12/34", "12\\34", "..", "12..34", "12?x=1", "12#f", "12%20", "12%2F34", "1e3", "+12", "-12", "12.5", "١٢٣", "12\n", "12\u0000", "abc", "12;34"]) {
      expect(isValidRealmId(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isValidRealmId(12345 as unknown)).toBe(false);
    expect(isValidRealmId(undefined as unknown)).toBe(false);
  });
});

describe("entity id (opaque string under a defensive boundary)", () => {
  it("normal numeric ids and other plain tokens are accepted", () => {
    for (const ok of ["1", "7", "123456", "9341456924700058", "abc-123_X", "SYNC:12:3", "a.b", "é"]) expect(isSafeEntityId(ok), ok).toBe(true);
  });

  it("is not limited to 20 characters or to digits: safe longer ids are not rejected by the old assumption", () => {
    expect(isSafeEntityId("9".repeat(21))).toBe(true);
    expect(isSafeEntityId("9".repeat(40))).toBe(true);
    expect(isSafeEntityId("x".repeat(QBO_ENTITY_ID_MAX_LENGTH))).toBe(true);
  });

  it("is bounded for local resource safety", () => {
    expect(isSafeEntityId("x".repeat(QBO_ENTITY_ID_MAX_LENGTH + 1))).toBe(false);
    expect(isSafeEntityId("9".repeat(1_000_000))).toBe(false);
  });

  it("rejects empty, non-string, dot-segment, separator, control-character and malformed-text ids", () => {
    for (const bad of ["", ".", "..", "a/b", "/", "a\\b", "\\", "../x", "a\nb", "a\rb", "a\tb", "a\u0000b", "a\u007fb", "a\u0085b", "a b", "\ud800", "a\udc00b"]) {
      expect(isSafeEntityId(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const notString of [null, undefined, 7, {}, ["1"], true]) expect(isSafeEntityId(notString as unknown)).toBe(false);
  });
});

describe("encodePathSegment", () => {
  it("leaves unreserved characters (including normal numeric ids) unchanged", () => {
    expect(encodePathSegment("9341456924700058")).toBe("9341456924700058");
    expect(encodePathSegment("abc-123_X.~")).toBe("abc-123_X.~");
  });

  it("encodes every URL-significant character so a segment can never alter structure", () => {
    expect(encodePathSegment("a b")).toBe("a%20b");
    expect(encodePathSegment("a?b=c")).toBe("a%3Fb%3Dc");
    expect(encodePathSegment("a#b")).toBe("a%23b");
    expect(encodePathSegment("100%")).toBe("100%25");
    expect(encodePathSegment("%2F")).toBe("%252F");
    expect(encodePathSegment("a/b")).toBe("a%2Fb");
    expect(encodePathSegment("a\\b")).toBe("a%5Cb");
    expect(encodePathSegment("a@evil.com")).toBe("a%40evil.com");
    expect(encodePathSegment("x'(y)*!")).toBe("x%27%28y%29%2A%21");
    expect(encodePathSegment("é")).toBe("%C3%A9");
    expect(encodePathSegment("a\nb")).toBe("a%0Ab");
    for (const out of ["a b", "a?b#c%d/e\\f", "@:;=+$,[]"].map(encodePathSegment)) {
      expect(out).toMatch(/^[A-Za-z0-9\-_.~%]+$/);
    }
  });

  it("refuses values that cannot be a single path segment (empty and dot-segments)", () => {
    for (const bad of ["", ".", ".."]) expect(() => encodePathSegment(bad)).toThrow(RangeError);
  });

  it("every encoded segment, placed in a URL, keeps the origin, the path depth and the query/fragment empty", () => {
    const hostile = ["a b", "a?b=c&d=e", "a#b", "%2e%2e", "%2E", "..%2F..", "a%00b", "http://evil.example", "//evil.example", "evil.com/../../x", "a@evil.example", "\\\\evil.example"];
    for (const raw of hostile) {
      const url = new URL(`https://sandbox-quickbooks.api.intuit.com/v3/company/123/invoice/${encodePathSegment(raw)}`);
      expect(url.origin).toBe("https://sandbox-quickbooks.api.intuit.com");
      expect(url.pathname.split("/")).toHaveLength(6);
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(decodeURIComponent(url.pathname.split("/")[5])).toBe(raw);
    }
  });
});
