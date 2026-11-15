import { describe, it, expect } from "vitest";
import { buildQboRequestUrl } from "@/domain/quickbooks/qbo-request-url";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";

const BASE = "https://sandbox-quickbooks.api.intuit.com";
const build = (segments: string[], over: Partial<Parameters<typeof buildQboRequestUrl>[0]> = {}) =>
  buildQboRequestUrl({ apiBaseUrl: BASE, realmId: "9341456924700058", segments, minorVersion: 75, ...over });

describe("buildQboRequestUrl", () => {
  it("builds the normal URL for current numeric ids unchanged", () => {
    const u = new URL(build(["invoice", "145"]));
    expect(u.origin).toBe(BASE);
    expect(u.pathname).toBe("/v3/company/9341456924700058/invoice/145");
    expect(u.searchParams.get("minorversion")).toBe("75");
  });

  it("encodes identifiers as one segment each: slash, query/fragment markers, percent, space and control characters", () => {
    for (const raw of ["a/b", "a?b=1", "a#b", "100%", "%2e%2e", "a b", "a\nb", "a\u0000b", "http://evil.example", "x@evil.example"]) {
      const u = new URL(build(["invoice", raw]));
      expect(u.origin, raw).toBe(BASE);
      expect(u.pathname.split("/"), raw).toHaveLength(6);
      expect(u.search, raw).toBe("?minorversion=75");
      expect(u.hash, raw).toBe("");
      expect(decodeURIComponent(u.pathname.split("/")[5]), raw).toBe(raw);
    }
  });

  it("refuses dot-segments and empty segments instead of letting the URL parser collapse the path", () => {
    for (const bad of ["..", ".", ""]) {
      expect(() => build(["invoice", bad])).toThrow(QboProviderError);
    }
    expect(() => build(["invoice", "x"], { realmId: ".." })).toThrow(QboProviderError);
  });

  it("the realm id is encoded as a segment too (it cannot add a path level or change the host)", () => {
    const u = new URL(build(["companyinfo", "1"], { realmId: "12/../34" }));
    expect(u.pathname.split("/")).toHaveLength(6);
    expect(u.pathname).toContain("12%2F..%2F34");
    expect(u.origin).toBe(BASE);
  });

  it("the origin/path guard refuses a base that is not a bare Intuit origin (defence in depth)", () => {
    for (const base of [`${BASE}/extra`, `${BASE}/v3/company/1`, `${BASE}?x=1`, `${BASE}#f`, "https://user:pw@sandbox-quickbooks.api.intuit.com", "not a url"]) {
      const e = (() => {
        try {
          build(["invoice", "1"], { apiBaseUrl: base });
        } catch (x) {
          return x as QboProviderError;
        }
        return null;
      })();
      expect(e?.kind, base).toBe("CONFIGURATION_ERROR");
      expect(e?.localReason, base).toBe("URL_ESCAPED_BASE");
    }
  });

  it("the guard holds independently of the encoder: with encoding bypassed, any escape is still refused", () => {
    const identity = (s: string) => s;
    for (const raw of ["..", "x/../../y", "a?b=1", "a#b", "a/../..", "../../x"]) {
      const e = (() => {
        try {
          build(["invoice", raw], { encodeSegment: identity });
        } catch (x) {
          return x as QboProviderError;
        }
        return null;
      })();
      expect(e?.localReason, raw).toBe("URL_ESCAPED_BASE");
    }
    // sanity: harmless segments still pass through the same path
    expect(new URL(build(["invoice", "145"], { encodeSegment: identity })).pathname).toBe("/v3/company/9341456924700058/invoice/145");
  });

  it("extra query parameters are set through URLSearchParams, so values cannot add parameters", () => {
    const u = new URL(build(["query"], { query: { query: "SELECT * FROM Invoice&minorversion=1#x" } }));
    expect([...u.searchParams.keys()]).toEqual(["minorversion", "query"]);
    expect(u.searchParams.get("minorversion")).toBe("75");
    expect(u.searchParams.get("query")).toBe("SELECT * FROM Invoice&minorversion=1#x");
    expect(u.hash).toBe("");
  });
});
