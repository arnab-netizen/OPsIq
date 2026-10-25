/**
 * Production acceptance fixture-isolation guards.
 *
 * A 201 from a create call is NOT proof that synthetic acceptance data is isolated from ordinary
 * owners. These helpers use only existing governed HTTP surfaces (never the Production database):
 *
 *  - assertFixtureCreationCapable: runs BEFORE any fixture-dependent record is created. Calls the
 *    SYSTEM_ADMIN-gated, read-only GET /api/admin/fixture-businesses with the nil workspace id
 *    (always an empty list, so it exposes no tenant data). 200 => the acceptance actor holds
 *    SYSTEM_ADMIN; anything else => stop the run before creating anything.
 *  - assertBusinessIsFixture / assertStartupSessionIsFixture: run AFTER a create. A fixture row is by
 *    definition excluded from the ordinary owner lists, so a created id that still appears in
 *    GET /api/owner/recovery/businesses (or the startup session list) is a real-looking business
 *    and the run fails immediately, before anything else mutates it.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { timedApiCall } from "./evidence";

const NIL_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

export const FIXTURE_ISOLATION_UNAVAILABLE =
  "FIXTURE ISOLATION UNAVAILABLE: the Production acceptance account cannot create fixture records " +
  "(CAPABILITIES.SYSTEM_ADMIN is required). Refusing to create synthetic acceptance data that would " +
  "be visible to ordinary owners.";

let preflightPassed = false;

export async function assertFixtureCreationCapable(
  context: BrowserContext | undefined,
  page: Page
): Promise<void> {
  if (preflightPassed) return;
  const res = await timedApiCall(context, "GET", "/api/admin/fixture-businesses", () =>
    page.request.get(`/api/admin/fixture-businesses?workspaceId=${NIL_WORKSPACE_ID}`)
  );
  if (res.status() !== 200) {
    throw new Error(`${FIXTURE_ISOLATION_UNAVAILABLE} (capability probe returned HTTP ${res.status()})`);
  }
  preflightPassed = true;
}

/** Test seam: forget a cached successful preflight. */
export function resetFixtureCapabilityPreflight(): void {
  preflightPassed = false;
}

async function listedInOrdinaryList(
  context: BrowserContext | undefined,
  page: Page,
  pathname: string,
  id: string
): Promise<boolean> {
  const res = await timedApiCall(context, "GET", pathname, () => page.request.get(pathname));
  if (!res.ok()) {
    throw new Error(`Cannot verify fixture isolation: GET ${pathname} returned HTTP ${res.status()}`);
  }
  return JSON.stringify(await res.json()).includes(id);
}

export async function assertBusinessIsFixture(
  context: BrowserContext | undefined,
  page: Page,
  businessId: string
): Promise<void> {
  if (await listedInOrdinaryList(context, page, "/api/owner/recovery/businesses", businessId)) {
    throw new Error(
      `${FIXTURE_ISOLATION_UNAVAILABLE} Business ${businessId} was created but is visible in the ordinary owner list; stop and do not mutate it further.`
    );
  }
}

export async function assertStartupSessionIsFixture(
  context: BrowserContext | undefined,
  page: Page,
  sessionId: string
): Promise<void> {
  if (await listedInOrdinaryList(context, page, "/api/owner/startup/sessions", sessionId)) {
    throw new Error(
      `${FIXTURE_ISOLATION_UNAVAILABLE} Startup session ${sessionId} was created but is visible in the ordinary owner list; stop and do not mutate it further.`
    );
  }
}
