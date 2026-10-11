/**
 * QuickBooks callback — grant revocation decision matrix (RC10), deterministic and DB-free.
 * Invariant: an OAuth grant is revoked at Intuit ONLY when it is certainly not stored AND no live connection holds the verified
 * company (an Intuit revocation may be app/company-wide). Unknown outcomes, state races and held companies never revoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  consume: vi.fn(), finalize: vi.fn(), held: vi.fn(), ready: vi.fn(), exchange: vi.fn(), revoke: vi.fn(), companyInfo: vi.fn(), emit: vi.fn(),
}));
vi.mock("@/services/quickbooks/qbo-connection.service", () => {
  class QboGrantNotStoredError extends Error {}
  return {
    beginQboAuthorization: vi.fn(), consumeQboAuthorizationState: m.consume, finalizeQboConnection: m.finalize,
    isQboRealmHeldLive: m.held, assertQboTokenEncryptionReady: m.ready, QboGrantNotStoredError,
  };
});
vi.mock("@/services/quickbooks/qbo-oauth.service", () => ({ exchangeQboAuthorizationCode: m.exchange, revokeQboToken: m.revoke }));
vi.mock("@/services/quickbooks/qbo-client", () => ({ createQboReadClient: () => ({ companyInfo: m.companyInfo }) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: m.emit }));

import { completeQboCallback } from "@/services/quickbooks/qbo-connect-callback.service";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import { NotFoundError } from "@/infra/errors";
import { QboGrantNotStoredError } from "@/services/quickbooks/qbo-connection.service";

const ENV = { QUICKBOOKS_CLIENT_ID: "cid", QUICKBOOKS_CLIENT_SECRET: "sec", QUICKBOOKS_REDIRECT_URI: "https://app.example.com/cb", QUICKBOOKS_ENVIRONMENT: "sandbox" };
const REALM = "9341000000001";
const STATE = "s".repeat(40);
const auth = { authorizationId: "a1", workspaceId: "w1", businessId: "b1", actorId: "u1", environment: "sandbox" };
const input = { workspaceId: "w1", actorId: "u1", query: new URLSearchParams({ state: STATE, code: "AUTHCODE", realmId: REALM }) };
const company = () => ({ CompanyInfo: { Id: REALM, CompanyName: "Co", SyncToken: "0", MetaData: { LastUpdatedTime: "2026-01-01T00:00:00Z" } } });
const call = () => completeQboCallback(input, { env: ENV });

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.consume.mockResolvedValue({ ok: true, authorization: auth });
  m.ready.mockReturnValue(undefined);
  m.exchange.mockResolvedValue({ accessToken: "A", refreshToken: "R" });
  m.companyInfo.mockResolvedValue(company().CompanyInfo);
  m.held.mockResolvedValue(false);
  m.revoke.mockResolvedValue(undefined);
  m.emit.mockResolvedValue(undefined);
  m.finalize.mockResolvedValue({ ok: true, reconnected: false });
});

const finalizeRefused = (reason: string) => m.finalize.mockResolvedValue({ ok: false, reason });

describe("grant revocation decision matrix", () => {
  it("success: never revokes", async () => {
    expect((await call()).ok).toBe(true);
    expect(m.revoke).not.toHaveBeenCalled();
  });

  it("REALM_ALREADY_BOUND never revokes (another connection holds the company)", async () => {
    finalizeRefused("REALM_ALREADY_BOUND");
    expect(await call()).toMatchObject({ ok: false, code: "REALM_UNAVAILABLE" });
    expect(m.revoke).not.toHaveBeenCalled();
  });

  it.each(["AUTHORIZATION_NOT_CONSUMED", "AUTHORIZATION_ALREADY_FINALIZED"])("state-race refusal %s never revokes", async (reason) => {
    finalizeRefused(reason);
    expect((await call()).ok).toBe(false);
    expect(m.revoke).not.toHaveBeenCalled();
    expect(m.held).not.toHaveBeenCalled();
  });

  it("BUSINESS_BOUND_TO_OTHER_REALM revokes only when no live connection holds the verified company", async () => {
    finalizeRefused("BUSINESS_BOUND_TO_OTHER_REALM");
    expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_HAS_OTHER_COMPANY" });
    expect(m.revoke).toHaveBeenCalledTimes(1);
    m.revoke.mockClear(); m.held.mockResolvedValue(true);
    expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_HAS_OTHER_COMPANY" });
    expect(m.revoke).not.toHaveBeenCalled();
  });

  it("an ineligible business (typed 4xx from finalize) revokes only when the company is not held live", async () => {
    m.finalize.mockRejectedValue(new NotFoundError("OwnerBusiness", "b1"));
    expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_NOT_ELIGIBLE" });
    expect(m.revoke).toHaveBeenCalledTimes(1);
    m.revoke.mockClear(); m.held.mockResolvedValue(true);
    expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_NOT_ELIGIBLE" });
    expect(m.revoke).not.toHaveBeenCalled();
  });

  it("an UNKNOWN commit outcome (non-domain error from the transaction) rethrows and never revokes", async () => {
    m.finalize.mockRejectedValue(new Error("connection reset during commit"));
    await expect(call()).rejects.toThrow("connection reset during commit");
    expect(m.revoke).not.toHaveBeenCalled();
    expect(m.held).not.toHaveBeenCalled();
  });

  it("a grant that could not be encrypted (certainly not stored) is discarded (guarded) and the error is rethrown", async () => {
    m.finalize.mockRejectedValue(new QboGrantNotStoredError());
    await expect(call()).rejects.toBeInstanceOf(QboGrantNotStoredError);
    expect(m.revoke).toHaveBeenCalledTimes(1);
    m.revoke.mockClear(); m.held.mockResolvedValue(true);
    await expect(call()).rejects.toBeInstanceOf(QboGrantNotStoredError);
    expect(m.revoke).not.toHaveBeenCalled();
  });

  describe("RC10: the CLIENT-RELAYED realm never informs a revoke decision (realm not proven => fail closed, no holder lookup, no revoke)", () => {
    const TAMPERED = "9341999999999"; // a company another tenant holds live; the attacker's grant actually belongs to another company
    const tampered = () => completeQboCallback({ ...input, query: new URLSearchParams({ state: STATE, code: "AUTHCODE", realmId: TAMPERED }) }, { env: ENV });
    const holderOnlyOf = (realm: string) => m.held.mockImplementation(async (i: { realmId: string }) => i.realmId === realm);

    it("tampered realm + provider verification fails (403): INVALID_REALM, the holder of the tampered realm is never consulted, nothing is revoked", async () => {
      holderOnlyOf(TAMPERED);
      m.companyInfo.mockRejectedValue(new QboProviderError({ kind: "FORBIDDEN" }));
      expect(await tampered()).toMatchObject({ ok: false, code: "INVALID_REALM" });
      expect(m.held).not.toHaveBeenCalled();
      expect(m.revoke).not.toHaveBeenCalled();
      expect(m.finalize).not.toHaveBeenCalled();
    });

    it("tampered realm + provider verification temporarily fails (timeout / 5xx / 429): PROVIDER_TEMPORARY, no holder lookup, no revoke", async () => {
      holderOnlyOf(TAMPERED);
      for (const kind of ["TIMEOUT", "TRANSIENT_PROVIDER_FAILURE", "RATE_LIMITED"] as const) {
        m.companyInfo.mockRejectedValue(new QboProviderError({ kind }));
        expect(await tampered()).toMatchObject({ ok: false, code: "PROVIDER_TEMPORARY" });
      }
      expect(m.held).not.toHaveBeenCalled();
      expect(m.revoke).not.toHaveBeenCalled();
    });

    it("tampered realm + MALFORMED provider response: INVALID_REALM, no holder lookup, no revoke", async () => {
      m.companyInfo.mockResolvedValue({ garbage: true });
      expect(await tampered()).toMatchObject({ ok: false, code: "INVALID_REALM" });
      m.companyInfo.mockResolvedValue(null);
      expect(await tampered()).toMatchObject({ ok: false, code: "INVALID_REALM" });
      expect(m.held).not.toHaveBeenCalled();
      expect(m.revoke).not.toHaveBeenCalled();
    });

    it("the provider reports a DIFFERENT company than the claimed one: not proven, no holder lookup, no revoke", async () => {
      m.companyInfo.mockResolvedValue({ Id: "9341555555555", CompanyName: "Other", SyncToken: "0", MetaData: { LastUpdatedTime: "2026-01-01T00:00:00Z" } });
      expect(await tampered()).toMatchObject({ ok: false, code: "INVALID_REALM" });
      expect(m.held).not.toHaveBeenCalled();
      expect(m.revoke).not.toHaveBeenCalled();
    });

    it("no live holder's grant is revoked on ANY verification failure, whatever the holder lookup would say", async () => {
      for (const holds of [true, false]) {
        m.held.mockResolvedValue(holds);
        for (const err of [new QboProviderError({ kind: "FORBIDDEN" }), new QboProviderError({ kind: "TIMEOUT" }), new Error("boom")]) {
          m.companyInfo.mockRejectedValue(err);
          expect((await tampered()).ok).toBe(false);
        }
      }
      expect(m.revoke).not.toHaveBeenCalled();
    });

    it("a PROVEN realm still follows the revoke policy, and the holder lookup is made for the PROVEN realm only", async () => {
      m.finalize.mockResolvedValue({ ok: false, reason: "BUSINESS_BOUND_TO_OTHER_REALM" });
      expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_HAS_OTHER_COMPANY" });
      expect(m.held).toHaveBeenCalledWith(expect.objectContaining({ realmId: REALM }), expect.anything());
      expect(m.revoke).toHaveBeenCalledTimes(1); // proven realm, no live holder
      m.revoke.mockClear();
      m.held.mockImplementation(async (i: { realmId: string }) => i.realmId === REALM);
      expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_HAS_OTHER_COMPANY" });
      expect(m.revoke).not.toHaveBeenCalled(); // proven realm with a live holder: never
    });
  });

  it("if the holder lookup itself fails, the grant is NOT revoked (the lesser harm)", async () => {
    finalizeRefused("BUSINESS_BOUND_TO_OTHER_REALM");
    m.held.mockRejectedValue(new Error("db down"));
    expect((await call()).ok).toBe(false);
    expect(m.revoke).not.toHaveBeenCalled();
  });

  it("a revoke that throws is swallowed: the typed outcome is still returned", async () => {
    finalizeRefused("BUSINESS_BOUND_TO_OTHER_REALM");
    m.revoke.mockRejectedValue(new Error("revoke endpoint down"));
    expect(await call()).toMatchObject({ ok: false, code: "BUSINESS_HAS_OTHER_COMPANY" });
  });

  it("a missing encryption key fails closed BEFORE the code exchange", async () => {
    m.ready.mockImplementation(() => { throw new QboGrantNotStoredError(); });
    expect(await call()).toMatchObject({ ok: false, code: "CONFIGURATION_UNAVAILABLE" });
    expect(m.exchange).not.toHaveBeenCalled();
    expect(m.revoke).not.toHaveBeenCalled();
  });
});
