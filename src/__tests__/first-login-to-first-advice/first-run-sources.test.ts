import { describe, expect, it } from "vitest";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import { QBO_FIRST_RUN_OFFER_ENV_KEY, QBO_PRODUCTION_ACCEPTANCE_ENV_KEY, qboFirstRunOffer } from "@/domain/quickbooks/qbo-first-run-offer";
import { QBO_OWNER_STATES } from "@/domain/quickbooks/qbo-owner-status";
import { landingForFirstRunState, resolveFirstRunSources } from "@/domain/owner-first-run/first-run-source";
import { FIRST_RUN_STATES, resolveFirstRunState, type FirstRunFacts } from "@/domain/owner-first-run/first-run-router";
import {
  QBO_FIRST_RUN_LANDING_PATH,
  QBO_OWNER_LANDING_PATH,
  qboLandingFromCallbackResponse,
  qboOutcomeRedirectPath,
} from "@/domain/quickbooks/qbo-connect-outcomes";

const cfgEnv = (over: Record<string, string | undefined> = {}) => ({
  QUICKBOOKS_CLIENT_ID: "client-id-123",
  QUICKBOOKS_CLIENT_SECRET: "secret-value-xyz",
  QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/owner/integrations/quickbooks/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  ...over,
});
const offer = (env: Record<string, string | undefined>) => qboFirstRunOffer(resolveQboConfig(env), env);

describe("qboFirstRunOffer — fail closed", () => {
  it("is closed when QuickBooks is not configured, even if the gate is on", () => {
    expect(offer({ [QBO_FIRST_RUN_OFFER_ENV_KEY]: "true" })).toMatchObject({ offered: false, reason: "NOT_CONFIGURED" });
  });
  it("is closed by default when configured (configuration alone never offers QuickBooks on the first screen)", () => {
    expect(offer(cfgEnv())).toMatchObject({ offered: false, reason: "OFFER_GATE_CLOSED", environment: "sandbox" });
  });
  it.each(["TRUE", "1", "yes", "", "false", "enabled"])("is closed for the non-exact gate value %j", (v) => {
    expect(offer(cfgEnv({ [QBO_FIRST_RUN_OFFER_ENV_KEY]: v })).offered).toBe(false);
  });
  it("is open for sandbox with the explicit gate", () => {
    expect(offer(cfgEnv({ [QBO_FIRST_RUN_OFFER_ENV_KEY]: "true" }))).toMatchObject({ offered: true, reason: "OFFERED", environment: "sandbox" });
  });
  it("keeps PRODUCTION closed until the separate acceptance confirmation is also explicit", () => {
    const prod = { QUICKBOOKS_ENVIRONMENT: "production", [QBO_FIRST_RUN_OFFER_ENV_KEY]: "true" };
    expect(offer(cfgEnv(prod))).toMatchObject({ offered: false, reason: "PRODUCTION_ACCEPTANCE_PENDING", environment: "production" });
    expect(offer(cfgEnv({ ...prod, [QBO_PRODUCTION_ACCEPTANCE_ENV_KEY]: "false" })).offered).toBe(false);
    expect(offer(cfgEnv({ ...prod, [QBO_PRODUCTION_ACCEPTANCE_ENV_KEY]: "true" }))).toMatchObject({ offered: true, environment: "production" });
  });
  it("the acceptance flag alone does not open anything", () => {
    expect(offer(cfgEnv({ QUICKBOOKS_ENVIRONMENT: "production", [QBO_PRODUCTION_ACCEPTANCE_ENV_KEY]: "true" })).offered).toBe(false);
  });
  it("never carries credentials in its result", () => {
    expect(JSON.stringify(offer(cfgEnv({ [QBO_FIRST_RUN_OFFER_ENV_KEY]: "true" })))).not.toContain("secret-value-xyz");
  });
});

describe("resolveFirstRunSources — what the step shows", () => {
  it("shows no QuickBooks route when it is not offered and not connected (no fake connector)", () => {
    for (const quickBooksState of ["NOT_CONNECTED", "DISCONNECTED"] as const) {
      expect(resolveFirstRunSources({ quickBooksOffered: false, quickBooksState })).toEqual({ quickBooks: "HIDDEN", manual: true, poll: false });
    }
  });
  it("offers QuickBooks only when the server offers it and nothing is connected", () => {
    expect(resolveFirstRunSources({ quickBooksOffered: true, quickBooksState: "NOT_CONNECTED" }).quickBooks).toBe("OFFER");
    expect(resolveFirstRunSources({ quickBooksOffered: true, quickBooksState: "DISCONNECTED" }).quickBooks).toBe("OFFER");
  });
  it("resumes an import in progress REGARDLESS of the offer gate, and polls", () => {
    for (const quickBooksState of ["CONNECTING", "IMPORTING"] as const) {
      for (const quickBooksOffered of [true, false]) {
        expect(resolveFirstRunSources({ quickBooksOffered, quickBooksState })).toEqual({ quickBooks: "IN_PROGRESS", manual: true, poll: true });
      }
    }
  });
  it("an existing connection that still lacks a first read asks for attention and never polls forever", () => {
    for (const quickBooksState of ["CONNECTED", "STALE", "SYNC_ERROR", "REAUTH_REQUIRED"] as const) {
      expect(resolveFirstRunSources({ quickBooksOffered: false, quickBooksState })).toEqual({ quickBooks: "ATTENTION", manual: true, poll: false });
    }
  });
  it("the manual route is available in every QuickBooks state", () => {
    for (const quickBooksState of QBO_OWNER_STATES) expect(resolveFirstRunSources({ quickBooksOffered: true, quickBooksState }).manual).toBe(true);
  });
});

describe("source choice never alters the canonical routing", () => {
  const facts = (over: Partial<FirstRunFacts>): FirstRunFacts => ({ hasBusiness: true, firstReadSufficient: false, hasDiagnosis: false, hasTrustedInteraction: false, ...over });
  it("the router has no source input: manual and QuickBooks evidence converge on the same states", () => {
    expect(resolveFirstRunState(facts({}))).toBe("NEEDS_EVIDENCE");
    expect(resolveFirstRunState(facts({ firstReadSufficient: true }))).toBe("NEEDS_DIAGNOSIS");
    expect(resolveFirstRunState(facts({ firstReadSufficient: true, hasDiagnosis: true }))).toBe("FIRST_RESULT");
    expect(resolveFirstRunState(facts({ firstReadSufficient: true, hasDiagnosis: true, hasTrustedInteraction: true }))).toBe("ESTABLISHED");
  });
  it("the post-QuickBooks landing is first-run only while the first read is pending", () => {
    const landing = Object.fromEntries(FIRST_RUN_STATES.map((s) => [s, landingForFirstRunState(s)]));
    expect(landing).toEqual({ NEEDS_BUSINESS: "data", NEEDS_EVIDENCE: "first_run", NEEDS_DIAGNOSIS: "first_run", FIRST_RESULT: "data", ESTABLISHED: "data" });
  });
});

describe("QuickBooks return landing", () => {
  it("only an exact first_run on a successful CONNECTED response lands on first-run", () => {
    expect(qboLandingFromCallbackResponse(200, { status: "CONNECTED", landing: "first_run" })).toBe("first_run");
    expect(qboLandingFromCallbackResponse(200, { status: "CONNECTED", landing: "data" })).toBe("data");
    expect(qboLandingFromCallbackResponse(200, { status: "CONNECTED", landing: "/evil" })).toBe("data");
    expect(qboLandingFromCallbackResponse(200, { status: "CONNECTED" })).toBe("data");
    expect(qboLandingFromCallbackResponse(409, { status: "CONNECTED", landing: "first_run" })).toBe("data");
    expect(qboLandingFromCallbackResponse(200, { status: "FAILED", landing: "first_run" })).toBe("data");
    expect(qboLandingFromCallbackResponse(200, null)).toBe("data");
  });
  it("builds only the two fixed paths with one closed token", () => {
    expect(qboOutcomeRedirectPath("connected")).toBe(`${QBO_OWNER_LANDING_PATH}?quickbooks=connected`);
    expect(qboOutcomeRedirectPath("connected", "first_run")).toBe(`${QBO_FIRST_RUN_LANDING_PATH}?quickbooks=connected`);
    expect(QBO_FIRST_RUN_LANDING_PATH).toBe("/owner/first-run");
  });
});
