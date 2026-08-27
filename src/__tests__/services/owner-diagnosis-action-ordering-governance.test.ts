/**
 * Governance/static proof for the deterministic-action-ordering fix, extended
 * to the sibling call sites PR #361's own "batch all instances" pass missed.
 *
 * PR #361 fixed the non-deterministic `orderBy: { priorityScore: "desc" }`
 * shape (see owner-action-dashboard-ordering-governance.test.ts for the full
 * incident writeup) in the 7 domain `dashboard.service.ts` files, but the
 * identical vulnerable shape -- same models, same clamped-score tie surface
 * -- was still live in three more places reachable from real owner-facing
 * routes:
 *   - `diagnosis.service.ts` in all 7 domains (the cycle-detail read AND the
 *     standalone `listXCycleActions` read both had their own copy of the
 *     query, independent of dashboard.service.ts's).
 *   - `business-condition.service.ts` (feeds `topActions` on
 *     `/api/owner/command-center`, the owner's primary landing-page API).
 *   - `home.service.ts` (feeds "Today's required actions" on the flagship
 *     `/owner/home` screen).
 *
 * Recovery is excluded from all of the above for the same reason it's
 * excluded from the dashboard.service.ts test: `founder-recovery` orders by
 * `createdAt: "asc"`, not a clamped numeric score, so it has no comparable
 * tie surface.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SRC_ROOT = join(process.cwd(), "src");

const AFFECTED_DOMAINS = [
  "owner-sales",
  "owner-operations",
  "owner-strategy",
  "owner-cashflow",
  "owner-marketing",
  "owner-finance",
  "owner-sop",
] as const;

const EXPECTED_ORDERBY_KEYS: Array<{ field: string; direction: "asc" | "desc" }> = [
  { field: "priorityScore", direction: "desc" },
  { field: "expectedImpactScore", direction: "desc" },
  { field: "confidence", direction: "desc" },
  { field: "findingCode", direction: "asc" },
  { field: "title", direction: "asc" },
  { field: "id", direction: "asc" },
];

function readSrc(...pathParts: string[]): string {
  return readFileSync(join(SRC_ROOT, ...pathParts), "utf-8");
}

/** "owner-sales" -> "ownerSalesAction" (matches this codebase's exact Prisma model naming). */
function actionModelName(domain: string): string {
  const suffix = domain.replace(/^owner-/, "");
  return `owner${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}Action`;
}

function extractOrderByKeyPairs(orderByArrayLiteral: string): Array<{ field: string; direction: "asc" | "desc" }> {
  return [...orderByArrayLiteral.matchAll(/\{\s*(\w+):\s*"(asc|desc)"\s*(?:as const)?\s*\}/g)].map((m) => ({
    field: m[1],
    direction: m[2] as "asc" | "desc",
  }));
}

describe("owner-domain diagnosis.service.ts action ordering -- deterministic total order (both call sites, all 7 domains)", () => {
  it.each(AFFECTED_DOMAINS)("%s/diagnosis.service.ts: no vulnerable single-key priorityScore-only orderBy remains anywhere in the file", (domain) => {
    const src = readSrc("services", domain, "diagnosis.service.ts");
    expect(src, `${domain}: single-key priorityScore-only orderBy must not exist`).not.toMatch(
      /orderBy:\s*\{\s*priorityScore:\s*"desc"\s*\}/
    );
  });

  it.each(AFFECTED_DOMAINS)("%s/diagnosis.service.ts: the getXDiagnosis cycle-detail actions include uses the exact 6-key deterministic order", (domain) => {
    const src = readSrc("services", domain, "diagnosis.service.ts");
    const match = src.match(/actions:\s*\{[\s\S]*?orderBy:\s*(\[[\s\S]*?\])\s*,?\s*\},/);
    expect(match, `${domain}: could not locate the actions{...orderBy: [...]} block`).toBeTruthy();
    expect(extractOrderByKeyPairs(match![1])).toEqual(EXPECTED_ORDERBY_KEYS);
  });

  it.each(AFFECTED_DOMAINS)("%s/diagnosis.service.ts: the standalone listXCycleActions findMany uses the exact 6-key deterministic order", (domain) => {
    const src = readSrc("services", domain, "diagnosis.service.ts");
    const modelName = actionModelName(domain);
    const match = src.match(new RegExp(`db\\.${modelName}\\.findMany\\(\\{[\\s\\S]*?orderBy:\\s*(\\[[\\s\\S]*?\\])`));
    expect(match, `${domain}: could not locate db.${modelName}.findMany's orderBy: [...] array`).toBeTruthy();
    expect(extractOrderByKeyPairs(match![1])).toEqual(EXPECTED_ORDERBY_KEYS);
  });
});

describe("owner-home/home.service.ts action ordering -- deterministic total order (spineCycleInclude, feeds /owner/home)", () => {
  it("no vulnerable single-key priorityScore-only orderBy remains in spineCycleInclude", () => {
    const src = readSrc("services", "owner-home", "home.service.ts");
    expect(src).not.toMatch(/orderBy:\s*\{\s*priorityScore:\s*"desc"\s*\}/);
  });

  it("spineCycleInclude.actions.orderBy uses the exact 6-key deterministic order", () => {
    const src = readSrc("services", "owner-home", "home.service.ts");
    const match = src.match(/actions:\s*\{[\s\S]*?orderBy:\s*(\[[\s\S]*?\])\s*,[\s\S]*?include:\s*\{\s*verifications/);
    expect(match, "could not locate spineCycleInclude's actions{...orderBy: [...]} block").toBeTruthy();
    expect(extractOrderByKeyPairs(match![1])).toEqual(EXPECTED_ORDERBY_KEYS);
  });
});

describe("owner-condition/business-condition.service.ts action ordering -- deterministic total order (feeds /api/owner/command-center topActions)", () => {
  const src = readSrc("services", "owner-condition", "business-condition.service.ts");

  it("no vulnerable single-key priorityScore-only orderBy remains anywhere in the file", () => {
    expect(src).not.toMatch(/orderBy:\s*\{\s*priorityScore:\s*"desc"\s*\}/);
  });

  it("defines a shared TOP_ACTION_ORDER_BY constant with the exact 6-key deterministic order", () => {
    const constMatch = src.match(/const TOP_ACTION_ORDER_BY\s*=\s*(\[[\s\S]*?\]);/);
    expect(constMatch, "could not locate the TOP_ACTION_ORDER_BY constant definition").toBeTruthy();
    expect(extractOrderByKeyPairs(constMatch![1])).toEqual(EXPECTED_ORDERBY_KEYS);
  });

  it("all 7 per-domain cycle queries' actions.orderBy reference the shared TOP_ACTION_ORDER_BY constant (not an inline duplicate)", () => {
    const referenceCount = [...src.matchAll(/actions:\s*\{\s*orderBy:\s*TOP_ACTION_ORDER_BY\s*\}/g)].length;
    expect(referenceCount, "expected exactly 7 domain cycle queries to reference TOP_ACTION_ORDER_BY").toBe(7);
  });
});
