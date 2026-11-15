/**
 * The Production closed loop (snapshot -> diagnosis -> action lifecycle -> verification -> reassessment) for a
 * bound fixture business, expressed as governed API calls.
 *
 * Every function here takes a FixtureBusinessTarget and sends mutations ONLY through fixtureMutate(), which
 * refuses any path whose ids are not that fixture (or an action proven to belong to it). There is deliberately no
 * UI in this module: in Production the ordinary owner UI selects its business from a fixture-free list, so a
 * browser click can never be shown to land on a fixture (Production run #17). The request bodies below are the
 * ones the owner pages send, so the same server validation and the same domain services are exercised.
 *
 * Specs call these helpers instead of building URLs, so the "mutation target == verified fixture" property is
 * enforced in one place and checked statically by src/__tests__/deployment/production-acceptance-fixture-target-
 * binding.test.ts.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  adoptActionsFromCycle,
  fixtureMutate,
  fixtureRead,
  FixtureBindingError,
  type FixtureBusinessTarget,
} from "./fixture-target";

/** A JSON object returned by an owner API. Only the fields the closed loop reads are typed; the rest stay unknown. */
export interface ApiRecord {
  [key: string]: unknown;
  id?: string;
  businessId?: string;
  status?: string;
  version?: number;
  selectedBusinessId?: string | null;
  cashflowState?: string;
  cycleNumber?: number;
  sequenceNumber?: number;
  baselineValue?: number;
  targetValue?: number | null;
  direction?: "up" | "down";
  actions?: Array<{ id: string; title?: string; businessId?: string }>;
  verifications?: Array<{ status?: string }>;
  result?: { reachedTarget?: boolean };
  snapshots?: ApiRecord[];
}

export const VERIFICATION_STATUSES = ["verified_improved", "verified_not_improved", "inconclusive", "disputed"] as const;

export interface ReportingPeriod {
  periodStart: string;
  periodEnd: string;
}

/** Same ~one-month window the owner forms were filled with: ends today, starts a month earlier. */
export function reportingPeriod(now: Date = new Date()): ReportingPeriod {
  const periodEnd = now.toISOString().slice(0, 10);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10);
  return { periodStart, periodEnd };
}

/** Numeric form fields arrive as strings in the cashflow fixtures; the owner page sends parseFloat of each. */
function numeric(fields: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && k !== "optionName" && k !== "riskLevel" && k !== "businessModel" ? parseFloat(v) : v;
  }
  return out;
}

export interface SavedSnapshot {
  id: string;
  body: Record<string, unknown>;
}

/** POST a snapshot (or, for strategy, a scenario; or, for recovery, a metric snapshot) to the bound fixture. */
export async function saveFixtureSnapshot(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  fields: Record<string, string | number>,
  period: ReportingPeriod = reportingPeriod()
): Promise<SavedSnapshot> {
  const res = await fixtureMutate(context, page, fx, "POST", `/api/owner/${fx.domain}/businesses/${fx.businessId}/snapshots`, {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "INR",
    ...numeric(fields),
  });
  expect(res.ok(), `${fx.domain} snapshot save failed: HTTP ${res.status()}`).toBe(true);
  const raw = (await res.json()) as Record<string, unknown>;
  // Recovery wraps the row: { snapshot, warnings }.
  const body = (raw.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : raw) as Record<string, unknown>;
  const id = body.id;
  expect(typeof id === "string" && id.length > 0, `${fx.domain} snapshot response carried no id`).toBe(true);
  expect(String(body.businessId).toLowerCase(), `${fx.domain} snapshot was saved on a different business than the bound fixture`).toBe(fx.businessId.toLowerCase());
  return { id: id as string, body };
}

/** Runs the domain diagnosis (recovery: a cycle) for a snapshot of the bound fixture. */
export async function runFixtureDiagnosis(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  snapshotId: string
): Promise<Record<string, unknown>> {
  const leaf = fx.domain === "recovery" ? "cycles" : "diagnoses";
  const res = await fixtureMutate(context, page, fx, "POST", `/api/owner/${fx.domain}/businesses/${fx.businessId}/${leaf}`, { snapshotId });
  expect(res.ok(), `${fx.domain} diagnosis failed: HTTP ${res.status()}`).toBe(true);
  const cycle = (await res.json()) as Record<string, unknown>;
  expect(cycle.id, `${fx.domain} diagnosis returned no cycle`).toBeTruthy();
  adoptActionsFromCycle(fx, cycle);
  return cycle;
}

/** The cycle ordinal: recovery cycles are numbered `cycleNumber`, every other domain `sequenceNumber`. */
export function cycleOrdinal(fx: FixtureBusinessTarget, cycle: ApiRecord): number {
  const n = fx.domain === "recovery" ? cycle.cycleNumber : cycle.sequenceNumber;
  expect(typeof n, `${fx.domain} cycle carried no ordinal`).toBe("number");
  return n as number;
}

/**
 * Positive isolation proof: the owner dashboard for this domain must NOT resolve the fixture as a selectable
 * business (fixtures are hidden from ordinary owners by design). Reads only; never a source of ids to mutate.
 */
export async function assertFixtureNotOnOwnerDashboard(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget
): Promise<void> {
  const res = await fixtureRead(context, page, fx, `/api/owner/${fx.domain}/dashboard?businessId=${fx.businessId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as ApiRecord;
  const selected = String(body.selectedBusinessId ?? "").toLowerCase();
  expect(selected, `${fx.domain} owner dashboard must not resolve the hidden fixture`).not.toBe(fx.businessId.toLowerCase());
}

/** The fixture's snapshots, read by the fixture's own id. */
export async function readFixtureSnapshots(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget
): Promise<Array<ApiRecord>> {
  const res = await fixtureRead(context, page, fx, `/api/owner/${fx.domain}/businesses/${fx.businessId}/snapshots`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const rows: Array<ApiRecord> = Array.isArray(body) ? body : body.snapshots ?? [];
  for (const r of rows) {
    if (r.businessId) expect(String(r.businessId).toLowerCase()).toBe(fx.businessId.toLowerCase());
  }
  return rows;
}

/** One of the fixture's own cycles, read by its id (a cycle id that no response proved belongs to the fixture is refused). */
export async function readFixtureCycle(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  cycleId: string
): Promise<ApiRecord> {
  const leaf = fx.domain === "recovery" ? "cycles" : "diagnoses";
  const res = await fixtureRead(context, page, fx, `/api/owner/${fx.domain}/${leaf}/${cycleId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as ApiRecord;
  expect(String(body.businessId).toLowerCase(), `${fx.domain} cycle belongs to a different business than the bound fixture`).toBe(fx.businessId.toLowerCase());
  return body;
}

export async function readFixtureAction(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  actionId: string
): Promise<ApiRecord> {
  const res = await fixtureRead(context, page, fx, `/api/owner/${fx.domain}/actions/${actionId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as ApiRecord;
  if (body.businessId && String(body.businessId).toLowerCase() !== fx.businessId.toLowerCase()) {
    throw new FixtureBindingError(`${fx.domain} action ${actionId} belongs to a different business than the bound fixture`);
  }
  return body;
}

/** PATCH an adopted action. Returns the raw response so a spec can assert a governed refusal (e.g. HTTP 409). */
export async function patchFixtureAction(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  actionId: string,
  body: Record<string, unknown>
) {
  return fixtureMutate(context, page, fx, "PATCH", `/api/owner/${fx.domain}/actions/${actionId}`, body);
}

/** Recovery actions use optimistic concurrency: the owner page sends the row's current `version`. */
async function withVersion(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget,
  actionId: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (fx.domain !== "recovery") return body;
  const row = await readFixtureAction(context, page, fx, actionId);
  return { ...body, version: row.version };
}

export const COMPLETION_NOTES = "Live production acceptance: completion notes";
export const COMPLETION_EVIDENCE = "acceptance-test-evidence-reference";

export interface LifecycleOutcome {
  /** Non-null when the diagnosis produced no actions to exercise (not a defect, not a pass either). */
  skippedReason: string | null;
  actionId: string | null;
}

/**
 * Assign -> Start -> Complete -> Verify against ONE exact action id taken from the fixture's own latest diagnosis cycle. Each
 * transition is read back by id, so "this exact action transitioned" does not depend on list order.
 */
export async function driveFixtureActionLifecycle(
  context: BrowserContext | undefined,
  page: Page,
  fx: FixtureBusinessTarget
): Promise<LifecycleOutcome> {
  const actions = fx.latestCycleActions;
  if (actions.length === 0) {
    return {
      skippedReason:
        "SKIPPED_NO_ACTIONS_GENERATED: this diagnosis produced zero findings/actions for the synthetic snapshot -- not a defect, but not exercisable this run.",
      actionId: null,
    };
  }
  const actionId = actions[0].id;
  const before = await readFixtureAction(context, page, fx, actionId);

  for (const status of ["assigned", "in_progress"] as const) {
    const res = await patchFixtureAction(context, page, fx, actionId, await withVersion(context, page, fx, actionId, { status }));
    expect(res.ok(), `${fx.domain} action ${status} transition failed: HTTP ${res.status()}`).toBe(true);
    expect((await readFixtureAction(context, page, fx, actionId)).status).toBe(status);
  }

  const completion =
    fx.domain === "recovery"
      ? { status: "completed", completionNotes: COMPLETION_NOTES, actualOutcome: COMPLETION_EVIDENCE }
      : { status: "completed", completionNotes: COMPLETION_NOTES, completionEvidence: [COMPLETION_EVIDENCE] };
  const done = await patchFixtureAction(context, page, fx, actionId, await withVersion(context, page, fx, actionId, completion));
  expect(done.ok(), `${fx.domain} action completion failed: HTTP ${done.status()}`).toBe(true);
  await expect(async () => {
    expect((await readFixtureAction(context, page, fx, actionId)).status).toBe("completed");
  }).toPass({ timeout: 15000 });

  // Completing an action triggers an automatic re-diagnosis (a new cycle). The action id is verified directly.
  let verifyBody: Record<string, number | string>;
  if (fx.domain === "recovery") {
    const { baselineValue, targetValue, direction } = before as { baselineValue: number; targetValue: number | null; direction: "up" | "down" };
    const target = targetValue ?? baselineValue;
    verifyBody = { afterValue: direction === "up" ? target + 1 : target - 1 };
  } else {
    verifyBody = { beforeValue: 100, afterValue: 50, targetDirection: "down" };
  }
  const verify = await fixtureMutate(context, page, fx, "POST", `/api/owner/${fx.domain}/actions/${actionId}/verify`, verifyBody);
  expect(verify.ok(), `${fx.domain} verify outcome failed: HTTP ${verify.status()}`).toBe(true);
  if (fx.domain === "recovery") {
    expect((await verify.json()).result?.reachedTarget, "expected the computed afterValue to reach the action's target").toBe(true);
  }

  const verified = await readFixtureAction(context, page, fx, actionId);
  expect(verified.status).toBe("completed");
  expect(VERIFICATION_STATUSES as readonly string[]).toContain(verified.verifications?.[0]?.status);
  return { skippedReason: null, actionId };
}
