/**
 * Runtime proof for tests/production/helpers/fixture-target.ts (Production run #17 remediation).
 *
 * Run #17 showed that "the fixture was created and is hidden" does not mean "the mutation hit the fixture":
 * the ordinary UI mutated an ordinary business. These tests prove the replacement rule -- a Production
 * mutation can only be SENT if every id in it is the verified fixture, or an action proven to belong to it --
 * against a fake page that records exactly what would have been sent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertMutationBound,
  assertReadBound,
  assertBodyIdsBound,
  isIdentifierKey,
  bindFixtureTarget,
  bindFixtureStartupSession,
  adoptActionsFromCycle,
  adoptStartupOwnedId,
  fixtureMutate,
  FixtureBindingError,
  type FixtureBusinessTarget,
} from "../../../tests/production/helpers/fixture-target";
import { resetFixtureCapabilityPreflight } from "../../../tests/production/helpers/fixture-isolation";

const FIXTURE = "11111111-1111-4111-8111-111111111111";
const ORDINARY_QA = "27abc1b9-b377-427d-a1a2-32881c2d4c99"; // the ordinary business run #17 actually mutated
const TRINITY = "22222222-2222-4222-8222-222222222222";
const OTHER_QA = "33333333-3333-4333-8333-333333333333";
const ACTION = "44444444-4444-4444-8444-444444444444";
const FOREIGN_ACTION = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const SNAPSHOT = "77777777-7777-4777-8777-777777777777";
const CYCLE = "88888888-8888-4888-8888-888888888888";

function target(domain: FixtureBusinessTarget["domain"] = "sales", adopted: string[] = [ACTION]): FixtureBusinessTarget {
  return { kind: "business", domain, businessId: FIXTURE, adoptedActionIds: new Set(adopted), ownedRecordIds: new Set<string>(), latestCycleActions: [], serverErrors: [] };
}

const res = (status: number, body: unknown = {}) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  json: async () => body,
  headers: () => ({ "content-type": "application/json" }),
});

function fakePage(opts: { ordinaryBusinesses?: unknown; snapshots?: unknown; recoveryList?: unknown; listStatus?: number } = {}) {
  const sent: Array<{ method: string; url: string }> = [];
  const page = {
    request: {
      get: vi.fn(async (url: string) => {
        sent.push({ method: "GET", url });
        if (url === "/api/admin/acceptance-fixtures/capability") return res(200, { acceptanceFixtureAuthority: true });
        if (url === "/api/owner/recovery/businesses") return res(200, opts.recoveryList ?? []);
        if (url === "/api/owner/businesses") return res(200, opts.ordinaryBusinesses ?? { businesses: [{ id: ORDINARY_QA, name: "QA D9 REAUDIT" }] });
        if (url === `/api/owner/sales/businesses/${FIXTURE}/snapshots`) return res(opts.listStatus ?? 200, opts.snapshots ?? [{ id: SNAPSHOT, businessId: FIXTURE }]);
        return res(200, {});
      }),
      fetch: vi.fn(async (url: string, init: { method: string }) => {
        sent.push({ method: init.method, url });
        return res(200, { ok: true });
      }),
    },
  };
  return { page, sent };
}

describe("assertMutationBound -- a mutation is refused unless every id is the bound fixture (or its proven action)", () => {
  it("accepts the fixture's own collection endpoints", () => {
    for (const sub of ["snapshots", "diagnoses"]) {
      expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/${sub}`)).not.toThrow();
    }
    expect(() => assertMutationBound(target("operations"), "POST", `/api/owner/operations/businesses/${FIXTURE}/capacity-snapshots`)).not.toThrow();
    expect(() => assertMutationBound(target("recovery"), "POST", `/api/owner/recovery/businesses/${FIXTURE}/cycles`)).not.toThrow();
  });

  it("accepts a proven action's PATCH and verify", () => {
    expect(() => assertMutationBound(target(), "PATCH", `/api/owner/sales/actions/${ACTION}`)).not.toThrow();
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/actions/${ACTION}/verify`)).not.toThrow();
  });

  it("REFUSES a deliberately different active ordinary business (the run #17 defect)", () => {
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${ORDINARY_QA}/snapshots`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${OTHER_QA}/diagnoses`)).toThrow(FixtureBindingError);
  });

  it("REFUSES Trinity (or any real business id)", () => {
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${TRINITY}/snapshots`)).toThrow(/not the bound sales fixture/);
  });

  it("REFUSES an action id that was not proven to belong to the fixture", () => {
    expect(() => assertMutationBound(target(), "PATCH", `/api/owner/sales/actions/${FOREIGN_ACTION}`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(target("sales", []), "PATCH", `/api/owner/sales/actions/${ACTION}`)).toThrow(/has not been proven/);
  });

  it("REFUSES a path that mixes the fixture with another id", () => {
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots/${ORDINARY_QA}`)).toThrow(FixtureBindingError);
  });

  it("a query parameter is never selection proof: any query string on a mutation is refused", () => {
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots?businessId=${FIXTURE}`)).toThrow(/query string/);
    expect(() => assertMutationBound(target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots?businessId=${ORDINARY_QA}`)).toThrow(FixtureBindingError);
  });

  it("REFUSES another domain's route, another origin, a non-API path, and a GET", () => {
    expect(() => assertMutationBound(target(), "POST", `/api/owner/finance/businesses/${FIXTURE}/snapshots`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(target(), "POST", `https://evil.example/api/owner/sales/businesses/${FIXTURE}/snapshots`)).toThrow(/relative \/api\/ paths/);
    expect(() => assertMutationBound(target(), "POST", `/owner/sales?businessId=${FIXTURE}`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(target(), "GET", `/api/owner/sales/dashboard?businessId=${FIXTURE}`)).toThrow(/not a mutation/);
  });

  it("REFUSES an arbitrary-id-free but unrecognised path (no generic admin or deletion surface)", () => {
    expect(() => assertMutationBound(target(), "DELETE", `/api/owner/sales/businesses/${FIXTURE}`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(target(), "POST", "/api/admin/fixture-businesses")).toThrow(FixtureBindingError);
  });

  it("startup-session targets are bound to the one fixture session", () => {
    const s = bindFixtureStartupSession(SESSION);
    expect(() => assertMutationBound(s, "PATCH", `/api/owner/startup/sessions/${SESSION}`)).not.toThrow();
    expect(() => assertMutationBound(s, "POST", `/api/owner/startup/sessions/${SESSION}/activate`)).not.toThrow();
    expect(() => assertMutationBound(s, "POST", `/api/admin/acceptance-fixtures/startup-sessions/${SESSION}/blueprint`)).not.toThrow();
    expect(() => assertMutationBound(s, "PATCH", `/api/owner/startup/sessions/${OTHER_QA}`)).toThrow(FixtureBindingError);
    expect(() => assertMutationBound(s, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`)).toThrow(FixtureBindingError);
  });
});

describe("assertReadBound", () => {
  it("allows the fixture-scoped dashboard and refuses any other business's", () => {
    expect(() => assertReadBound(target(), `/api/owner/sales/dashboard?businessId=${FIXTURE}`)).not.toThrow();
    expect(() => assertReadBound(target(), `/api/owner/sales/dashboard?businessId=${ORDINARY_QA}`)).toThrow(FixtureBindingError);
    expect(() => assertReadBound(target(), `/api/owner/sales/dashboard`)).toThrow(FixtureBindingError);
  });

  it("allows the control-center block counters only when scoped to the fixture", () => {
    expect(() => assertReadBound(target("cashflow"), `/api/owner/control-center?businessId=${FIXTURE}`)).not.toThrow();
    expect(() => assertReadBound(target("cashflow"), `/api/owner/control-center?businessId=${ORDINARY_QA}`)).toThrow(FixtureBindingError);
    expect(() => assertReadBound(target("cashflow"), `/api/owner/control-center`)).toThrow(FixtureBindingError);
  });
});

describe("assertReadBound -- the acceptance-only Cashflow gate-verdict path (one exact path, not a broad allow rule)", () => {
  function cashflowTarget(adopted: string[] = [ACTION]): FixtureBusinessTarget {
    return { kind: "business", domain: "cashflow", businessId: FIXTURE, adoptedActionIds: new Set(adopted), ownedRecordIds: new Set<string>(), latestCycleActions: [], serverErrors: [] };
  }

  it("allows the bound fixture's own businessId + an adopted action + toStatus=in_progress", () => {
    const t = cashflowTarget([ACTION]);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${ACTION}/gate-verdict?toStatus=in_progress`)).not.toThrow();
  });

  it("refuses another business id in the businessId slot", () => {
    const t = cashflowTarget([ACTION]);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${ORDINARY_QA}/cashflow/actions/${ACTION}/gate-verdict?toStatus=in_progress`)).toThrow(FixtureBindingError);
  });

  it("refuses an unadopted action id, even one that is merely 'known' (ownedRecordIds, not adoptedActionIds)", () => {
    const t = cashflowTarget([]);
    t.ownedRecordIds.add(FOREIGN_ACTION); // a snapshot/cycle id, not an action -- must not satisfy the adopted-action requirement
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${FOREIGN_ACTION}/gate-verdict?toStatus=in_progress`)).toThrow(FixtureBindingError);
  });

  it("refuses another domain entirely (the target's own domain gates the whole branch)", () => {
    const t = target("sales", [ACTION]); // a sales fixture, not cashflow
    t.ownedRecordIds.add(FIXTURE);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${ACTION}/gate-verdict?toStatus=in_progress`)).toThrow(FixtureBindingError);
  });

  it("refuses another target status", () => {
    const t = cashflowTarget([ACTION]);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${ACTION}/gate-verdict?toStatus=completed`)).toThrow(FixtureBindingError);
  });

  it("refuses an additional unexpected query parameter", () => {
    const t = cashflowTarget([ACTION]);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${ACTION}/gate-verdict?toStatus=in_progress&extra=1`)).toThrow(FixtureBindingError);
  });

  it("does not add a broad /api/admin/acceptance-fixtures/** allow rule -- a sibling path under the same prefix is still refused", () => {
    const t = cashflowTarget([ACTION]);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}/cashflow/actions/${ACTION}/something-else`)).toThrow(FixtureBindingError);
    expect(() => assertReadBound(t, `/api/admin/acceptance-fixtures/businesses/${FIXTURE}`)).toThrow(FixtureBindingError);
  });
});

describe("assertReadBound -- reads are addressed by id; only records a response proved are readable", () => {
  it("allows the fixture's own snapshot/cycle lists and refuses another business's", () => {
    expect(() => assertReadBound(target(), `/api/owner/sales/businesses/${FIXTURE}/snapshots`)).not.toThrow();
    expect(() => assertReadBound(target(), `/api/owner/sales/businesses/${FIXTURE}/diagnoses`)).not.toThrow();
    expect(() => assertReadBound(target(), `/api/owner/sales/businesses/${ORDINARY_QA}/snapshots`)).toThrow(FixtureBindingError);
  });

  it("refuses a cycle or snapshot id that no fixture response proved", () => {
    expect(() => assertReadBound(target(), `/api/owner/sales/diagnoses/${CYCLE}`)).toThrow(FixtureBindingError);
    const t = target();
    t.ownedRecordIds.add(CYCLE);
    expect(() => assertReadBound(t, `/api/owner/sales/diagnoses/${CYCLE}`)).not.toThrow();
    expect(() => assertReadBound(t, `/api/owner/sales/diagnoses/${CYCLE}/actions`)).not.toThrow();
    expect(() => assertReadBound(t, `/api/owner/sales/diagnoses/${SNAPSHOT}`)).toThrow(FixtureBindingError);
    expect(() => assertReadBound(target("recovery"), `/api/owner/recovery/cycles/${CYCLE}`)).toThrow(FixtureBindingError);
  });
});

describe("fixtureMutate -- nothing is SENT for a refused target", () => {
  beforeEach(() => resetFixtureCapabilityPreflight());

  it("sends the fixture mutation exactly as given", async () => {
    const { page, sent } = fakePage();
    await fixtureMutate(undefined, page as never, target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, { periodStart: "2026-01-01" });
    expect(sent).toEqual([{ method: "POST", url: `/api/owner/sales/businesses/${FIXTURE}/snapshots` }]);
  });

  it("never sends a request for a different ordinary business, Trinity, or another QA business", async () => {
    const { page, sent } = fakePage();
    for (const id of [ORDINARY_QA, TRINITY, OTHER_QA]) {
      await expect(fixtureMutate(undefined, page as never, target(), "POST", `/api/owner/sales/businesses/${id}/snapshots`, {})).rejects.toThrow(FixtureBindingError);
    }
    expect(page.request.fetch).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("records 5xx responses on the fixture's API calls (page listeners cannot see page.request traffic)", async () => {
    const { page } = fakePage();
    const t = target();
    page.request.fetch.mockResolvedValueOnce(res(503, {}));
    await fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {});
    expect(t.serverErrors).toEqual([{ path: "/api/owner/sales/businesses/:id/snapshots", status: 503 }]);
  });

  it("records the snapshot / cycle ids a fixture response proves it owns (including a wrapped recovery snapshot)", async () => {
    const { page } = fakePage();
    const t = target();
    page.request.fetch.mockResolvedValueOnce(res(200, { id: CYCLE, businessId: FIXTURE }));
    await fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/diagnoses`, {});
    page.request.fetch.mockResolvedValueOnce(res(200, { snapshot: { id: SNAPSHOT, businessId: FIXTURE }, warnings: [] }));
    await fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {});
    expect([...t.ownedRecordIds].sort()).toEqual([CYCLE, SNAPSHOT].sort());
  });

  it("does not record a response that carries no businessId (ownership is never assumed)", async () => {
    const { page } = fakePage();
    const t = target();
    page.request.fetch.mockResolvedValueOnce(res(200, { id: CYCLE }));
    await fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/diagnoses`, {});
    expect(t.ownedRecordIds.size).toBe(0);
  });

  it("fails if the server echoes a different business than the bound fixture", async () => {
    const { page } = fakePage();
    page.request.fetch.mockResolvedValueOnce(res(200, { businessId: ORDINARY_QA }));
    await expect(fixtureMutate(undefined, page as never, target(), "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {})).rejects.toThrow(/different business/);
  });
});

describe("bindFixtureTarget -- the id must be a hidden fixture AND addressable by its own id", () => {
  beforeEach(() => resetFixtureCapabilityPreflight());

  it("binds a fixture that is absent from the ordinary lists and answers by id", async () => {
    const { page } = fakePage();
    const t = await bindFixtureTarget(undefined, page as never, "sales", FIXTURE);
    expect(t).toMatchObject({ kind: "business", domain: "sales", businessId: FIXTURE });
    expect(page.request.get).toHaveBeenCalledWith(`/api/owner/sales/businesses/${FIXTURE}/snapshots`);
  });

  it("never reads a dashboard to bind (fixtures are hidden from dashboards by design)", async () => {
    const { page, sent } = fakePage();
    await bindFixtureTarget(undefined, page as never, "sales", FIXTURE);
    expect(sent.some((s) => s.url.includes("/dashboard"))).toBe(false);
  });

  it("refuses a 'fixture' that is visible in the ordinary owner business list (what the UI selects from)", async () => {
    const { page, sent } = fakePage({ ordinaryBusinesses: { businesses: [{ id: FIXTURE }] } });
    await expect(bindFixtureTarget(undefined, page as never, "sales", FIXTURE)).rejects.toThrow(/visible in the ordinary owner business list/);
    expect(sent.some((s) => s.method !== "GET")).toBe(false);
  });

  it("refuses a fixture the recovery list exposes", async () => {
    const { page } = fakePage({ recoveryList: [{ id: FIXTURE }] });
    await expect(bindFixtureTarget(undefined, page as never, "sales", FIXTURE)).rejects.toThrow(/visible in the ordinary owner list/);
  });

  it("refuses when the fixture is not addressable by id", async () => {
    const { page } = fakePage({ listStatus: 404 });
    await expect(bindFixtureTarget(undefined, page as never, "sales", FIXTURE)).rejects.toThrow(/not addressable by id/);
  });

  it("refuses when the fixture's snapshot list contains a row of a DIFFERENT business", async () => {
    const { page } = fakePage({ snapshots: [{ id: SNAPSHOT, businessId: ORDINARY_QA }] });
    await expect(bindFixtureTarget(undefined, page as never, "sales", FIXTURE)).rejects.toThrow(/DIFFERENT business/);
  });

  it("refuses a non-UUID id", async () => {
    const { page } = fakePage();
    await expect(bindFixtureTarget(undefined, page as never, "sales", "not-a-uuid")).rejects.toThrow(FixtureBindingError);
  });
});

describe("fixtureMutate -- a request-body identifier must be proven to belong to the bound target, not just the path", () => {
  beforeEach(() => resetFixtureCapabilityPreflight());

  it("REFUSES an unowned snapshotId in the body and sends nothing (the runFixtureDiagnosis gap)", async () => {
    const { page, sent } = fakePage();
    const t = target();
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/diagnoses`, { snapshotId: ORDINARY_QA })
    ).rejects.toThrow(FixtureBindingError);
    expect(page.request.fetch).not.toHaveBeenCalled();
    expect(sent.some((s) => s.method !== "GET")).toBe(false);
  });

  it("allows a snapshotId once a response has proven it belongs to the fixture", async () => {
    const { page } = fakePage();
    const t = target();
    t.ownedRecordIds.add(SNAPSHOT);
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/diagnoses`, { snapshotId: SNAPSHOT })
    ).resolves.toBeDefined();
    expect(page.request.fetch).toHaveBeenCalledTimes(1);
  });

  it("validates recursively: an unowned id nested inside the body is still refused", async () => {
    const { page } = fakePage();
    const t = target();
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {
        profile: { nested: { snapshotId: ORDINARY_QA } },
      })
    ).rejects.toThrow(FixtureBindingError);
    expect(page.request.fetch).not.toHaveBeenCalled();
  });

  it("validates an array of ids under a plural *Ids key", async () => {
    const { page } = fakePage();
    const t = target();
    t.ownedRecordIds.add(SNAPSHOT);
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {
        snapshotIds: [SNAPSHOT, ORDINARY_QA],
      })
    ).rejects.toThrow(FixtureBindingError);
    expect(page.request.fetch).not.toHaveBeenCalled();
  });

  it("does not use a broad substring check: a non-id-keyed field holding a foreign-looking UUID is not blocked", async () => {
    const { page } = fakePage();
    const t = target();
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, {
        rationale: `see also ${ORDINARY_QA}`,
        candidate: ORDINARY_QA,
      })
    ).resolves.toBeDefined();
  });

  it("the bound target's own id (businessId) is always allowed in a body field named *Id", async () => {
    const { page } = fakePage();
    const t = target();
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, { businessId: FIXTURE })
    ).resolves.toBeDefined();
  });

  it("an adopted action id is allowed in a body field named *Id", async () => {
    const { page } = fakePage();
    const t = target("sales", [ACTION]);
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, { linkedActionId: ACTION })
    ).resolves.toBeDefined();
  });

  it("startup-session targets: refuses an unowned ideaId / ownerDecisionId in the body", async () => {
    const { page } = fakePage();
    const s = bindFixtureStartupSession(SESSION);
    await expect(
      fixtureMutate(undefined, page as never, s, "POST", `/api/owner/startup/sessions/${SESSION}/decision`, { ideaId: ORDINARY_QA })
    ).rejects.toThrow(FixtureBindingError);
    expect(page.request.fetch).not.toHaveBeenCalled();
  });

  it("startup-session targets: an id adopted via adoptStartupOwnedId is then allowed in a mutation body", async () => {
    const { page } = fakePage();
    const s = bindFixtureStartupSession(SESSION);
    // handoffIdeaId: adopted from a read of the bound session itself (10-startup-mode-acceptance.spec.ts 13-01).
    const ideaId = adoptStartupOwnedId(s, ORDINARY_QA);
    expect(ideaId).toBe(ORDINARY_QA);
    await expect(
      fixtureMutate(undefined, page as never, s, "POST", `/api/owner/startup/sessions/${SESSION}/decision`, { ideaId })
    ).resolves.toBeDefined();

    // ownerDecisionId: a second, distinct id adopted from the decision response, then reused in the blueprint body.
    const ownerDecisionId = adoptStartupOwnedId(s, TRINITY);
    await expect(
      fixtureMutate(undefined, page as never, s, "POST", `/api/admin/acceptance-fixtures/startup-sessions/${SESSION}/blueprint`, {
        ideaId,
        ownerDecisionId,
      })
    ).resolves.toBeDefined();
  });

  it("adoptStartupOwnedId refuses a non-UUID", () => {
    const s = bindFixtureStartupSession(SESSION);
    expect(() => adoptStartupOwnedId(s, "not-a-uuid")).toThrow(FixtureBindingError);
  });

  it("assertBodyIdsBound is pure and side-effect free (no network, usable without a browser)", () => {
    expect(() => assertBodyIdsBound(target(), { snapshotId: ORDINARY_QA })).toThrow(FixtureBindingError);
    expect(() => assertBodyIdsBound(target(), undefined)).not.toThrow();
    const t = target();
    t.ownedRecordIds.add(SNAPSHOT);
    expect(() => assertBodyIdsBound(t, { snapshotId: SNAPSHOT })).not.toThrow();
  });

  it("isIdentifierKey catches bare id/ID, snake_case, and camelCase ID variants (post-review hardening)", () => {
    for (const key of ["id", "Id", "ID", "ids", "Ids", "IDs", "business_id", "business_ids", "snapshotId", "snapshotIds", "snapshotID", "ideaId", "ownerDecisionId"]) {
      expect(isIdentifierKey(key), `expected "${key}" to be treated as an identifier key`).toBe(true);
    }
  });

  it("isIdentifierKey still rejects ordinary lowercase words ending in id (no broad substring check)", () => {
    for (const key of ["paid", "void", "grid", "valid", "invalid", "liquid", "solid", "rapid", "android", "avoid"]) {
      expect(isIdentifierKey(key), `expected "${key}" NOT to be treated as an identifier key`).toBe(false);
    }
  });

  it("the hardened key matcher closes the snake_case and bare-id bypasses end-to-end through fixtureMutate", async () => {
    const { page } = fakePage();
    const t = target();
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, { snapshot_id: ORDINARY_QA })
    ).rejects.toThrow(FixtureBindingError);
    await expect(
      fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, { id: ORDINARY_QA })
    ).rejects.toThrow(FixtureBindingError);
    expect(page.request.fetch).not.toHaveBeenCalled();
  });

  it("validates the exact snapshot it sends (TOCTOU hardening): a getter that differs per read cannot evade the guard", async () => {
    const { page } = fakePage();
    const t = target();
    let reads = 0;
    const body = {
      get snapshotId() {
        reads += 1;
        // If the validator and the real send each read this independently, the first read (validation) would
        // see the allowed id and the second (serialization) would see the foreign one -- the snapshot-once
        // fix means only ONE read ever happens, so this getter's second branch is never reachable.
        return reads === 1 ? SNAPSHOT : ORDINARY_QA;
      },
    };
    t.ownedRecordIds.add(SNAPSHOT);
    // Without the snapshot fix this would resolve (validator sees SNAPSHOT, wire would see ORDINARY_QA).
    // With JSON.parse(JSON.stringify(...)) taken once, the getter is invoked exactly once and its single
    // result is what both validation and the request body carry.
    await fixtureMutate(undefined, page as never, t, "POST", `/api/owner/sales/businesses/${FIXTURE}/snapshots`, body);
    expect(reads).toBe(1);
    expect(page.request.fetch).toHaveBeenCalledWith(
      `/api/owner/sales/businesses/${FIXTURE}/snapshots`,
      expect.objectContaining({ data: { snapshotId: SNAPSHOT } })
    );
  });
});

describe("adoptActionsFromCycle -- only actions of a cycle that names the fixture can ever be mutated", () => {
  it("adopts the fixture cycle's actions, remembers them as the latest, and then allows exactly those", () => {
    const t = target("sales", []);
    const adopted = adoptActionsFromCycle(t, { id: CYCLE, businessId: FIXTURE, actions: [{ id: ACTION, title: "t", businessId: FIXTURE }] });
    expect(adopted.map((a) => a.id)).toEqual([ACTION]);
    expect(t.latestCycleActions.map((a) => a.id)).toEqual([ACTION]);
    expect(() => assertMutationBound(t, "PATCH", `/api/owner/sales/actions/${ACTION}`)).not.toThrow();
    expect(() => assertMutationBound(t, "PATCH", `/api/owner/sales/actions/${FOREIGN_ACTION}`)).toThrow(FixtureBindingError);
  });

  it("adopts nothing from a cycle that does not name the fixture", () => {
    const t = target("sales", []);
    expect(() => adoptActionsFromCycle(t, { id: CYCLE, businessId: ORDINARY_QA, actions: [{ id: ACTION }] })).toThrow(/does not name the bound fixture/);
    expect(() => adoptActionsFromCycle(t, { id: CYCLE, actions: [{ id: ACTION }] })).toThrow(FixtureBindingError);
    expect(t.adoptedActionIds.size).toBe(0);
  });

  it("fails if a fixture cycle lists an action that names another business", () => {
    const t = target("sales", []);
    expect(() => adoptActionsFromCycle(t, { id: CYCLE, businessId: FIXTURE, actions: [{ id: ACTION, businessId: ORDINARY_QA }] })).toThrow(/another business/);
  });
});
