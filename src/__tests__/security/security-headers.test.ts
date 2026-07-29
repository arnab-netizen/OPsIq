/**
 * Phase 5: Verify that next.config.ts configures required security response headers.
 * Tests are static-source checks — no server startup required.
 */
import { readFileSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "next.config.ts");
const src = readFileSync(CONFIG_PATH, "utf-8");

describe("next.config.ts — security headers", () => {
  it("sets poweredByHeader: false to suppress X-Powered-By", () => {
    expect(src).toContain("poweredByHeader: false");
  });

  it("defines a headers() export", () => {
    expect(src).toMatch(/async\s+headers\s*\(\s*\)/);
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(src).toContain("X-Content-Type-Options");
    expect(src).toContain("nosniff");
  });

  it("sets X-Frame-Options: DENY", () => {
    expect(src).toContain("X-Frame-Options");
    expect(src).toContain("DENY");
  });

  it("sets Referrer-Policy", () => {
    expect(src).toContain("Referrer-Policy");
    expect(src).toContain("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy", () => {
    expect(src).toContain("Permissions-Policy");
    expect(src).toContain("camera=()");
    expect(src).toContain("microphone=()");
  });

  it("sets Content-Security-Policy", () => {
    expect(src).toContain("Content-Security-Policy");
    expect(src).toContain("default-src");
    expect(src).toContain("frame-ancestors");
  });

  it("CSP includes frame-ancestors 'none' to block clickjacking", () => {
    expect(src).toContain("frame-ancestors 'none'");
  });

  it("does not include unsafe-eval in production CSP", () => {
    // In production (isProd=true) the CSP string should NOT include unsafe-eval.
    // The config conditionally omits it: `${isProd ? "" : " 'unsafe-eval'"}`.
    expect(src).toMatch(/'unsafe-eval'.*isProd/s);
    // Specifically: the ternary must gate it on !isProd.
    expect(src).toMatch(/isProd\s*\?\s*""\s*:\s*" 'unsafe-eval'"/);
  });

  it("applies HSTS only in production", () => {
    expect(src).toContain("Strict-Transport-Security");
    // HSTS must be inside a conditional block on isProd.
    const hstsIdx = src.indexOf("Strict-Transport-Security");
    const isProdBefore = src.lastIndexOf("isProd", hstsIdx);
    expect(isProdBefore).toBeGreaterThan(-1);
  });

  it("HSTS value includes max-age and includeSubDomains", () => {
    expect(src).toContain("max-age=31536000");
    expect(src).toContain("includeSubDomains");
  });

  it("applies headers to all routes via source '/(.*)'", () => {
    expect(src).toContain("source: \"/(.*)\",");
  });
});
