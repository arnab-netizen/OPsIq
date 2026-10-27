/**
 * Fixture-target binding for the LIVE Production acceptance lane.
 *
 * Root cause this closes (Production run #17): the domain specs created a hidden fixture business and then drove
 * the ORDINARY owner UI at `/owner/<domain>?businessId=<fixture>`. No page consumes that query parameter. Every
 * page takes its business from ActiveBusinessContext, which is built from GET /api/owner/businesses -- a list that
 * deliberately excludes fixtures -- so the UI saved snapshots and ran diagnoses against an ordinary business
 * instead of the fixture. "The fixture was created and is hidden" was never evidence that "the mutation hit the
 * fixture".
 *
 * Design (Option A): in Production the browser UI is READ-ONLY against ordinary businesses. Every mutation goes
 * through this module, which makes the target an explicit, verified fixture id:
 *
 *  - `bindFixtureTarget` proves the id is a fixture (absent from every ordinary owner list) AND addressable by
 *    id (its own snapshot list answers), before it can be used. Fixtures are hidden from the owner dashboards by
 *    design, so every read is addressed by id, never through a dashboard.
 *  - `fixtureMutate` builds nothing: it only ACCEPTS a path and refuses it, before any request is sent, unless
 *    every UUID in it is the bound fixture id or a record id that a response proved belongs to it (snapshot, cycle,
 *    action: each carries a businessId that equals the fixture).
 *    A different ordinary business, Trinity, an unproven action id, or a smuggled query string cannot be sent.
 *  - A query parameter is never selection proof: mutations carry no query string at all.
 *
 * `assertMutationBound` is pure so the refusal rules are unit-tested without a browser or a server.
 */
import type { APIResponse, BrowserContext, Page } from "@playwright/test";
import { timedApiCall } from "./evidence";
import { assertBusinessIsFixture, assertFixtureCreationCapable, assertStartupSessionIsFixture } from "./fixture-isolation";

export type FixtureDomain = "finance" | "sales" | "operations" | "strategy" | "cashflow" | "marketing" | "recovery";

export class FixtureBindingError extends Error {
  constructor(message: string) {
    super(`FIXTURE_BINDING_VIOLATION: ${message}`);
    this.name = "FixtureBindingError";
  }
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_EXACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FixtureBusinessTarget {
  readonly kind: "business";
  readonly domain: FixtureDomain;
  readonly businessId: string;
  /** Action ids proven, by a response carrying this fixture's businessId, to belong to it. */
  readonly adoptedActionIds: Set<string>;
  /** Snapshot / cycle ids proven, by a response carrying this fixture's businessId, to belong to it. */
  readonly ownedRecordIds: Set<string>;
  /** The actions of the most recent diagnosis cycle this fixture returned (already adopted). */
  latestCycleActions: Array<{ id: string; title?: string }>;
  /**
   * 5xx responses seen on this fixture's API calls. page.on("response") never sees page.request traffic, so the
   * "no 5xx in this journey" assertions read this instead.
   */
  readonly serverErrors: Array<{ path: string; status: number }>;
}

export interface FixtureStartupTarget {
  readonly kind: "startup-session";
  readonly sessionId: string;
}

export type FixtureTarget = FixtureBusinessTarget | FixtureStartupTarget;

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Collection endpoints that live under /businesses/<fixtureId>/ in each domain. */
const BUSINESS_SUBRESOURCES = "(snapshots|diagnoses|cycles|capacity-snapshots|workload-snapshots)";

function parse(rawPath: string): { pathname: string; search: string } {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/api/")) {
    throw new FixtureBindingError(`only relative /api/ paths are accepted, got ${JSON.stringify(String(rawPath).slice(0, 60))}`);
  }
  const url = new URL(rawPath, "https://fixture-binding.invalid");
  return { pathname: url.pathname, search: url.search };
}

function foreignUuids(text: string, allowed: Iterable<string>): string[] {
  const ok = new Set([...allowed].map((s) => s.toLowerCase()));
  return (text.match(UUID_RE) ?? []).filter((u) => !ok.has(u.toLowerCase()));
}

/**
 * Pure refusal rules. Throws FixtureBindingError unless `method rawPath` can only touch `target` (or a record
 * proven to belong to it). Never sends anything.
 */
export function assertMutationBound(target: FixtureTarget, method: string, rawPath: string): void {
  const verb = method.toUpperCase();
  if (!MUTATING_METHODS.has(verb)) {
    throw new FixtureBindingError(`${verb} is not a mutation; use fixtureRead for reads`);
  }
  const { pathname, search } = parse(rawPath);
  if (search !== "") {
    throw new FixtureBindingError("a mutation must not carry a query string (a query parameter is never selection proof)");
  }

  if (target.kind === "startup-session") {
    const sid = target.sessionId;
    const allowed = [
      new RegExp(`^/api/owner/startup/sessions/${sid}(/(analysis|decision|activate))?$`, "i"),
      new RegExp(`^/api/admin/acceptance-fixtures/startup-sessions/${sid}/blueprint$`, "i"),
    ];
    if (!allowed.some((re) => re.test(pathname))) {
      throw new FixtureBindingError(`${verb} ${pathname} is not a startup-session path bound to fixture session ${sid}`);
    }
    const foreign = foreignUuids(pathname, [sid]);
    if (foreign.length > 0) throw new FixtureBindingError(`path references a non-fixture id: ${foreign.join(", ")}`);
    return;
  }

  const { domain, businessId } = target;
  const onAction = pathname.match(new RegExp(`^/api/owner/${domain}/actions/(${UUID_RE.source})(/verify)?$`, "i"));
  if (onAction) {
    const actionId = onAction[1].toLowerCase();
    const adopted = [...target.adoptedActionIds].some((a) => a.toLowerCase() === actionId);
    if (!adopted) {
      throw new FixtureBindingError(
        `action ${actionId} has not been proven to belong to the ${domain} fixture ${businessId}; adopt it from the fixture dashboard first`
      );
    }
    return;
  }

  const foreign = foreignUuids(pathname, [businessId]);
  if (foreign.length > 0) {
    throw new FixtureBindingError(
      `${verb} ${pathname} references id(s) that are not the bound ${domain} fixture or one of its proven actions: ${foreign.join(", ")}`
    );
  }
  const onBusiness = new RegExp(`^/api/owner/${domain}/businesses/${businessId}/${BUSINESS_SUBRESOURCES}$`, "i");
  if (onBusiness.test(pathname)) return;
  throw new FixtureBindingError(`${verb} ${pathname} is not a ${domain} path bound to fixture ${businessId}`);
}

/** Pure refusal rules for reads: the same id-containment rule, GET only. */
export function assertReadBound(target: FixtureBusinessTarget, rawPath: string): void {
  const { pathname, search } = parse(rawPath);
  const { domain, businessId } = target;
  const known = [businessId, ...target.adoptedActionIds, ...target.ownedRecordIds];
  const foreign = foreignUuids(`${pathname}${search}`, known);
  if (foreign.length > 0) {
    throw new FixtureBindingError(`read ${pathname}${search} references id(s) outside the bound ${domain} fixture: ${foreign.join(", ")}`);
  }
  // Fixtures are hidden from the owner dashboards by design: a dashboard read can only prove the fixture is NOT
  // resolved there. It is never a source of ids to mutate.
  const dashboard =
    (pathname === `/api/owner/${domain}/dashboard` || pathname === "/api/owner/control-center") && search === `?businessId=${businessId}`;
  const underBusiness = new RegExp(`^/api/owner/${domain}/businesses/${businessId}(/[a-z-]+)?$`, "i").test(pathname) && search === "";
  const byId = new RegExp(
    `^/api/owner/${domain}/(actions|snapshots|diagnoses|cycles)/${UUID_RE.source}(/(actions|findings))?$`,
    "i"
  ).test(pathname) && search === "";
  if (!(dashboard || underBusiness || byId)) {
    throw new FixtureBindingError(`read ${pathname}${search} is not a ${domain} read bound to fixture ${businessId}`);
  }
}

function label(rawPath: string): string {
  return rawPath.replace(UUID_RE, ":id").replace(/\?.*$/, "");
}

/**
 * Binds a created fixture business so mutations can target it. Stops BEFORE any mutation if the id is not provably
 * a hidden fixture, or if the fixture is not addressable through its own fixture-scoped dashboard.
 */
export async function bindFixtureTarget(
  context: BrowserContext | undefined,
  page: Page,
  domain: FixtureDomain,
  businessId: string
): Promise<FixtureBusinessTarget> {
  if (!UUID_EXACT.test(businessId)) throw new FixtureBindingError(`${domain}: fixture business id is not a UUID`);
  await assertFixtureCreationCapable(context, page);
  await assertBusinessIsFixture(context, page, businessId);

  // The list every ordinary owner page builds its selector from. A fixture must not be in it -- if it were, it would
  // be a real-looking business and the run must stop before touching it.
  const ordinary = await timedApiCall(context, "GET", "/api/owner/businesses", () => page.request.get("/api/owner/businesses"));
  if (!ordinary.ok()) throw new FixtureBindingError(`cannot verify fixture isolation: GET /api/owner/businesses returned HTTP ${ordinary.status()}`);
  if (JSON.stringify(await ordinary.json()).toLowerCase().includes(businessId.toLowerCase())) {
    throw new FixtureBindingError(`${domain} fixture ${businessId} is visible in the ordinary owner business list; stop`);
  }

  const target: FixtureBusinessTarget = {
    kind: "business",
    domain,
    businessId,
    adoptedActionIds: new Set<string>(),
    ownedRecordIds: new Set<string>(),
    latestCycleActions: [],
    serverErrors: [],
  };

  // Addressable BY ID: the fixture's own snapshot list answers, and nothing in it belongs to another business.
  const list = await fixtureRead(context, page, target, `/api/owner/${domain}/businesses/${businessId}/snapshots`);
  if (!list.ok()) throw new FixtureBindingError(`${domain} fixture is not addressable by id: snapshot list returned HTTP ${list.status()}`);
  const rows = await list.json();
  const items: unknown[] = Array.isArray(rows) ? rows : Array.isArray(rows?.snapshots) ? rows.snapshots : [];
  for (const row of items) {
    const owner = row && typeof row === "object" ? (row as { businessId?: unknown }).businessId : undefined;
    if (typeof owner === "string" && owner.toLowerCase() !== businessId.toLowerCase()) {
      throw new FixtureBindingError(`${domain} fixture snapshot list contains a row of a DIFFERENT business`);
    }
  }
  return target;
}

export function bindFixtureStartupSession(sessionId: string): FixtureStartupTarget {
  if (!UUID_EXACT.test(sessionId)) throw new FixtureBindingError("startup fixture session id is not a UUID");
  return { kind: "startup-session", sessionId };
}

/** Confirms the startup session is hidden from the ordinary session list, then binds it. */
export async function bindVerifiedFixtureStartupSession(
  context: BrowserContext | undefined,
  page: Page,
  sessionId: string
): Promise<FixtureStartupTarget> {
  const target = bindFixtureStartupSession(sessionId);
  await assertStartupSessionIsFixture(context, page, sessionId);
  return target;
}

export async function fixtureRead(
  context: BrowserContext | undefined,
  page: Page,
  target: FixtureBusinessTarget,
  rawPath: string
): Promise<APIResponse> {
  assertReadBound(target, rawPath);
  const res = await timedApiCall(context, "GET", label(rawPath), () => page.request.get(rawPath));
  if (res.status() >= 500) target.serverErrors.push({ path: label(rawPath), status: res.status() });
  return res;
}

function sameBusiness(value: unknown, businessId: string): boolean {
  return typeof value === "string" && value.toLowerCase() === businessId.toLowerCase();
}

/**
 * Adopts the actions embedded in a cycle that THIS fixture's diagnosis returned. An action is adopted only if the
 * cycle and the action both name the bound fixture; a cycle or action of another business adopts nothing and throws.
 */
export function adoptActionsFromCycle(
  target: FixtureBusinessTarget,
  cycle: { id?: unknown; businessId?: unknown; actions?: unknown }
): Array<{ id: string; title?: string }> {
  if (!sameBusiness(cycle.businessId, target.businessId)) {
    throw new FixtureBindingError(`${target.domain} cycle does not name the bound fixture; its actions cannot be adopted`);
  }
  const adopted: Array<{ id: string; title?: string }> = [];
  for (const a of Array.isArray(cycle.actions) ? (cycle.actions as Array<{ id?: unknown; title?: unknown; businessId?: unknown }>) : []) {
    if (typeof a?.id !== "string" || !UUID_EXACT.test(a.id)) continue;
    if (a.businessId !== undefined && !sameBusiness(a.businessId, target.businessId)) {
      throw new FixtureBindingError(`${target.domain} cycle listed action ${a.id} belonging to another business`);
    }
    target.adoptedActionIds.add(a.id);
    adopted.push({ id: a.id, title: typeof a.title === "string" ? a.title : undefined });
  }
  target.latestCycleActions = adopted;
  return adopted;
}

/** Records the snapshot / cycle ids that a successful response proved belong to the bound fixture. */
function recordOwned(target: FixtureBusinessTarget, body: unknown): void {
  if (!body || typeof body !== "object") return;
  const top = body as { id?: unknown; businessId?: unknown; snapshot?: { id?: unknown; businessId?: unknown } };
  for (const rec of [top, top.snapshot]) {
    if (rec && typeof rec.id === "string" && UUID_EXACT.test(rec.id) && sameBusiness(rec.businessId, target.businessId)) {
      target.ownedRecordIds.add(rec.id);
    }
  }
}

/** The ONLY way a Production spec may send a POST/PATCH/PUT/DELETE to a business-scoped domain route. */
export async function fixtureMutate(
  context: BrowserContext | undefined,
  page: Page,
  target: FixtureTarget,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  rawPath: string,
  data?: unknown
): Promise<APIResponse> {
  assertMutationBound(target, method, rawPath);
  const res = await timedApiCall(context, method, label(rawPath), () =>
    page.request.fetch(rawPath, { method, ...(data === undefined ? {} : { data }) })
  );
  if (target.kind === "business" && res.status() >= 500) target.serverErrors.push({ path: label(rawPath), status: res.status() });
  if (target.kind === "business") {
    const ct = res.headers()["content-type"] ?? "";
    if (res.ok() && ct.includes("json")) {
      const body = await res.json().catch(() => null);
      // Belt and braces: a response that names a business must name THIS one (also for an embedded snapshot).
      const records = body && typeof body === "object" ? [body as { businessId?: unknown }, (body as { snapshot?: { businessId?: unknown } }).snapshot] : [];
      for (const rec of records) {
        if (rec && typeof rec.businessId === "string" && !sameBusiness(rec.businessId, target.businessId)) {
          throw new FixtureBindingError(`${target.domain} mutation response names a different business than the bound fixture`);
        }
      }
      recordOwned(target, body);
    }
  }
  return res;
}
