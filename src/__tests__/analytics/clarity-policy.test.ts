import { describe, it, expect } from "vitest";
import {
  CLARITY_CONSENT_STORAGE_KEY,
  CLARITY_CONSENT_V2,
  CLARITY_FORBIDDEN_PREFIXES,
  clarityTagUrl,
  isClarityEligiblePath,
  isDocumentNavigationRequired,
  normalizeClarityProjectId,
  parseAnalyticsConsent,
  resolveClarityProjectId,
  SERVER_REDIRECTING_PUBLIC_PATHS,
} from "@/lib/analytics/clarity-policy";

describe("route allowlist (unknown route = DENY)", () => {
  it.each([
    "/", "/about", "/resources", "/resources/", "/resources/how-to-read-margin", "/resources/a/b", "/tools/profit-margin-calculator", "/tools/anything",
    "/privacy", "/terms", "/beta", "/about/", "/privacy?x=1", "/beta#top",
  ])("allows %s", (p) => expect(isClarityEligiblePath(p)).toBe(true));

  it.each([
    "/login", "/signup", "/owner", "/owner/cockpit", "/owner/finance", "/admin", "/admin/users", "/dashboard", "/dashboard/x",
    "/api", "/api/auth/signin", "/api/owner/home", "/auth/callback", "/forgot-password", "/reset-password", "/verify-email",
    "/resend-verification", "/onboarding", "/quick-start", "/my-day", "/operator", "/clients/abc", "/_next/static/x.js",
  ])("denies %s", (p) => expect(isClarityEligiblePath(p)).toBe(false));

  it.each(["/pricing", "/blog", "/Login", "/ABOUT", "/aboutx", "/resourcesx", "/resources-x", "/toolsx", "/tools", "/tools/", "/privacy-policy", "/beta/extra", "/about/team", ""])(
    "denies unknown or near-miss route %j",
    (p) => expect(isClarityEligiblePath(p)).toBe(false),
  );

  it.each([
    "/resources/../login", "/resources/../../owner/cockpit", "/tools/./../signup", "/resources/%2e%2e/login", "/resources/%2E%2E/admin",
    "/resources%2Flogin", "/resources/a%5Cb", "//evil.example/resources/x", "/resources//x", "\\login", "/resources/x\u0000", "/resources/x\n", "login", "about",
  ])("denies traversal / encoded / malformed path %j", (p) => expect(isClarityEligiblePath(p)).toBe(false));

  it.each(["/blog/post", "/blog", "/docs/getting-started", "/help/contact", "/pricing/team", "/learn/x", "/changelog/2026", "/status", "/careers/engineering", "/signin", "/sign-in", "/register", "/account/settings", "/settings", "/app/home", "/v1/x"])(
    "denies a prefix that is not on the allowlist: %s (only /resources/* and /tools/* open up)",
    (p) => expect(isClarityEligiblePath(p)).toBe(false),
  );

  it("the explicit forbidden list pins every auth/private surface (a removal must fail a test)", () => {
    for (const required of ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/auth", "/owner", "/admin", "/dashboard", "/api", "/onboarding", "/_next"]) {
      expect(CLARITY_FORBIDDEN_PREFIXES, required).toContain(required);
    }
  });

  it("the forbidden list is an independent barrier: it denies even if the allowlist were widened to include the path", () => {
    // /resources/ is a real allowlisted prefix; nothing under a forbidden prefix may ever be reachable through it.
    for (const p of ["/resources/../login", "/tools/../admin", "/resources/%2e%2e/dashboard"]) expect(isClarityEligiblePath(p)).toBe(false);
  });

  it("denies non-string input", () => {
    for (const v of [undefined, null, 5, {}, []]) expect(isClarityEligiblePath(v)).toBe(false);
  });

  it("every explicitly forbidden prefix is denied, with any suffix", () => {
    for (const prefix of CLARITY_FORBIDDEN_PREFIXES) {
      expect(isClarityEligiblePath(prefix)).toBe(false);
      expect(isClarityEligiblePath(`${prefix}/anything/deep`)).toBe(false);
    }
  });
});

describe("analytics preference (versioned, malformed = no consent)", () => {
  it("uses the versioned storage key", () => expect(CLARITY_CONSENT_STORAGE_KEY).toBe("opsiq_analytics_consent_v1"));
  it("accepts exactly granted | denied", () => {
    expect(parseAnalyticsConsent("granted")).toBe("granted");
    expect(parseAnalyticsConsent("denied")).toBe("denied");
  });
  it.each([null, undefined, "", " granted", "granted ", "GRANTED", "Granted", "true", "1", "yes", "allow", "{\"consent\":\"granted\"}", "granted,denied", 1, true, {}, []])(
    "treats %j as no consent",
    (v) => expect(parseAnalyticsConsent(v)).toBeNull(),
  );
});

describe("project id (missing/malformed = fail closed)", () => {
  it("accepts the production id", () => expect(normalizeClarityProjectId("ymoglnln74")).toBe("ymoglnln74"));
  it("trims surrounding whitespace", () => expect(normalizeClarityProjectId("  ymoglnln74\n")).toBe("ymoglnln74"));
  it.each([undefined, null, "", "   ", "abc", "YMOGLNLN74", "ymoglnln74/../x", "yml?x=1", "a b c d e f g", "ymoglnln74;alert(1)", "https://x.test/a", "x".repeat(40), 5, {}])(
    "rejects %j",
    (v) => expect(normalizeClarityProjectId(v)).toBeNull(),
  );
  it("builds the tag URL only from a valid id", () => {
    expect(clarityTagUrl("ymoglnln74")).toBe("https://www.clarity.ms/tag/ymoglnln74");
    expect(clarityTagUrl("../evil")).toBeNull();
    expect(clarityTagUrl("")).toBeNull();
  });
});

describe("configuration gate (production deployment + valid id)", () => {
  const id = "ymoglnln74";
  it("returns the id only on the Vercel production deployment", () => {
    expect(resolveClarityProjectId({ VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: id })).toBe(id);
    expect(resolveClarityProjectId({ VERCEL_ENV: "preview", NEXT_PUBLIC_CLARITY_PROJECT_ID: id })).toBeNull();
    expect(resolveClarityProjectId({ VERCEL_ENV: "development", NEXT_PUBLIC_CLARITY_PROJECT_ID: id })).toBeNull();
    expect(resolveClarityProjectId({ NEXT_PUBLIC_CLARITY_PROJECT_ID: id })).toBeNull();
  });
  it("is null when the id is missing, empty or malformed", () => {
    expect(resolveClarityProjectId({ VERCEL_ENV: "production" })).toBeNull();
    expect(resolveClarityProjectId({ VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "" })).toBeNull();
    expect(resolveClarityProjectId({ VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "bad id!" })).toBeNull();
  });
});

describe("Consent API v2 payload", () => {
  it("grants analytics storage and always denies advertising storage", () => {
    expect(CLARITY_CONSENT_V2).toEqual({ analytics_Storage: "granted", ad_Storage: "denied" });
  });
});

describe("full-document navigation boundary (isDocumentNavigationRequired)", () => {
  it.each(["/login", "/signup", "/signup?ref=beta", "/login#x", "/owner/cockpit", "/admin/users", "/dashboard/x", "/api/auth/callback/x", "/forgot-password", "/verify-email", "/unknown-route", "/resources/../login"])(
    "requires a full-document load for %s",
    (h) => expect(isDocumentNavigationRequired(h)).toBe(true),
  );
  it.each(["/", "/?utm_source=x", "/#top"])("%s is eligible but redirects signed-in visitors into the private app, so it is a full-document target", (h) => {
    expect(isClarityEligiblePath(h)).toBe(true);
    expect(isDocumentNavigationRequired(h)).toBe(true);
  });
  it("only the declared redirecting pages are affected", () => {
    expect([...SERVER_REDIRECTING_PUBLIC_PATHS]).toEqual(["/"]);
  });
  it.each(["/about", "/resources", "/resources/x", "/tools/profit-margin-calculator", "/privacy", "/terms", "/beta", "/beta#request"])(
    "keeps %s a client-side link",
    (h) => expect(isDocumentNavigationRequired(h)).toBe(false),
  );
  it("does not concern external, mailto/tel or same-page targets", () => {
    for (const h of ["https://example.com/login", "mailto:support@opsiq.solutions", "tel:+1555", "//cdn.example.com/x", "#top"]) {
      expect(isDocumentNavigationRequired(h)).toBe(false);
    }
  });
  it("fails closed for relative or non-string targets", () => {
    for (const h of ["login", "../login", "./x", undefined, null, 5]) expect(isDocumentNavigationRequired(h)).toBe(true);
  });
});
