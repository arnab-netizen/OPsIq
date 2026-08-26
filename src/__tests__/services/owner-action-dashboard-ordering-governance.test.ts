/**
 * Governance/static proof for the deterministic-action-ordering fix.
 *
 * Incident: live production acceptance (run 32953759246, main
 * 5b4fc924400c052beb603455f8c304c114bc7a95) failed identically in Sales,
 * Operations, Strategy, Cashflow, and Marketing at the "Assign" step. Root
 * cause: `dashboard.service.ts`'s `actions: { orderBy: { priorityScore:
 * "desc" } }` query has no deterministic secondary sort key, while
 * `calculateOwnerPriorityScore`'s hard `clampScore` ceiling (contracts.ts)
 * makes ties at exactly 100 a routine occurrence whenever a scenario
 * produces 2+ simultaneous critical-severity findings -- exactly what each
 * domain's "deliberately stressed" acceptance snapshot is designed to do.
 * With no tiebreak, Postgres's row order for tied `priorityScore` values is
 * not guaranteed stable across two separate SELECTs; an unrelated UPDATE
 * (the Assign PATCH) can change which tied row is returned first on the
 * very next read, silently reordering the owner-visible action list.
 * Finance and SOP share the identical vulnerable query (verified directly
 * against their `dashboard.service.ts` files) but did not fail this run
 * only because their scenarios didn't happen to produce a tie -- a
 * data-triggered non-manifestation of the same latent defect, not code-level
 * immunity. Recovery is NOT part of this defect class: it orders by
 * `createdAt: "asc"` instead of a clamped numeric score, so it has no
 * comparable tie surface.
 *
 * Important: rankOwnerActions() (contracts.ts) -- the pure in-memory ranker
 * with the "canonical" tiebreak chain (priority -> impact -> confidence ->
 * findingCode -> title) -- is NOT itself a total order: its comparator
 * returns 0 (a tie) if all five fields match, and OwnerAction.id is
 * `.optional()` in that type, so it cannot safely add its own id-based
 * tiebreak. The SQL-level fix below deliberately does NOT merely copy that
 * comparator -- it appends `id: "asc"` as a mandatory final key, which is
 * safe here because every affected Prisma model's `id` is a `@id @db.Uuid`
 * primary key: guaranteed unique, non-null, and immutable for the lifetime
 * of the row.
 *
 * This file scans the 7 affected `dashboard.service.ts` files by an
 * explicit, closed list (not a directory glob) -- there is no shared "list
 * of owner-domain dashboard services" module to discover dynamically, and
 * the corresponding action Prisma models are named individually. Adding an
 * 8th domain with the same vulnerable pattern requires updating this list;
 * failing to do so is a process gap, not something a dynamic scan can catch
 * for a service directory structure like this one -- unlike
 * production-acceptance-domain-isolation.test.ts's tests/production/ glob,
 * which works because every acceptance spec matches one filename pattern.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SRC_ROOT = join(process.cwd(), "src");

// Every domain whose dashboard.service.ts's `actions` query previously used
// the vulnerable single-key `orderBy: { priorityScore: "desc" }` shape.
// Recovery is deliberately excluded -- it orders by `createdAt: "asc"` and
// was independently confirmed unaffected.
const AFFECTED_DOMAINS = [
  "owner-sales",
  "owner-operations",
  "owner-strategy",
  "owner-cashflow",
  "owner-marketing",
  "owner-finance",
  "owner-sop",
] as const;

function dashboardServiceSrc(domain: string): string {
  return readFileSync(join(SRC_ROOT, "services", domain, "dashboard.service.ts"), "utf-8");
}

// The exact deterministic tiebreak chain, in order. The first 5 keys mirror
// rankOwnerActions()'s own chain; `id` is the mandatory total-order
// terminator that function's comparator lacks.
const EXPECTED_ORDERBY_KEYS: Array<{ field: string; direction: "asc" | "desc" }> = [
  { field: "priorityScore", direction: "desc" },
  { field: "expectedImpactScore", direction: "desc" },
  { field: "confidence", direction: "desc" },
  { field: "findingCode", direction: "asc" },
  { field: "title", direction: "asc" },
  { field: "id", direction: "asc" },
];

describe("owner-domain dashboard action ordering -- deterministic total order (all 7 affected domains)", () => {
  it("found the expected 7 affected domain service files (sanity check)", () => {
    expect(AFFECTED_DOMAINS.length).toBe(7);
    for (const domain of AFFECTED_DOMAINS) {
      expect(() => dashboardServiceSrc(domain)).not.toThrow();
    }
  });

  it.each(AFFECTED_DOMAINS)(
    "%s/dashboard.service.ts: the actions query no longer uses the vulnerable single-key orderBy",
    (domain) => {
      const src = dashboardServiceSrc(domain);
      // The old, vulnerable shape must be completely gone -- not merely
      // supplemented. A regression that re-adds `orderBy: { priorityScore:
      // "desc" }` as a single object (rather than inside the array) must
      // fail here.
      expect(src, `${domain}: single-key priorityScore-only orderBy must not exist`).not.toMatch(
        /actions:\s*\{[^}]*orderBy:\s*\{\s*priorityScore:\s*"desc"\s*\}/s
      );
    }
  );

  it.each(AFFECTED_DOMAINS)(
    "%s/dashboard.service.ts: the actions query orderBy is an array (multi-key), not a single object",
    (domain) => {
      const src = dashboardServiceSrc(domain);
      const actionsBlockMatch = src.match(/actions:\s*\{[\s\S]*?orderBy:\s*(\[[\s\S]*?\])\s*,?\s*\},/);
      expect(actionsBlockMatch, `${domain}: could not locate the actions{...orderBy: [...]} block`).toBeTruthy();
    }
  );

  it.each(AFFECTED_DOMAINS)(
    "%s/dashboard.service.ts: the orderBy chain matches the exact deterministic key sequence, in order",
    (domain) => {
      const src = dashboardServiceSrc(domain);
      const actionsBlockMatch = src.match(/actions:\s*\{[\s\S]*?orderBy:\s*(\[[\s\S]*?\])\s*,?\s*\},/);
      expect(actionsBlockMatch).toBeTruthy();
      const orderByBlock = actionsBlockMatch![1];

      // Extract every { field: "direction" } pair in the array, in the
      // literal order they appear in source -- this is what Prisma treats
      // as sort-key precedence.
      const keyPairs = [...orderByBlock.matchAll(/\{\s*(\w+):\s*"(asc|desc)"\s*\}/g)].map((m) => ({
        field: m[1],
        direction: m[2] as "asc" | "desc",
      }));

      expect(keyPairs, `${domain}: expected ${EXPECTED_ORDERBY_KEYS.length} orderBy keys`).toEqual(
        EXPECTED_ORDERBY_KEYS
      );
    }
  );

  it.each(AFFECTED_DOMAINS)(
    "%s/dashboard.service.ts: the orderBy chain terminates in a unique key (id) -- the total-order requirement",
    (domain) => {
      const src = dashboardServiceSrc(domain);
      const actionsBlockMatch = src.match(/actions:\s*\{[\s\S]*?orderBy:\s*(\[[\s\S]*?\])\s*,?\s*\},/);
      const orderByBlock = actionsBlockMatch![1];
      const keyPairs = [...orderByBlock.matchAll(/\{\s*(\w+):\s*"(asc|desc)"\s*\}/g)].map((m) => m[1]);
      // The FINAL key in the chain must be `id`. A future edit that adds
      // more tiebreak fields but drops/reorders `id` away from the end
      // reintroduces the same non-total-order class this fix closes --
      // this assertion exists specifically so that regression fails loudly
      // rather than silently, regardless of how many keys precede it.
      expect(keyPairs[keyPairs.length - 1], `${domain}: final orderBy key must be "id"`).toBe("id");
    }
  );

  it("Recovery's dashboard.service.ts was NOT modified by this fix (confirms exclusion is deliberate, not an oversight)", () => {
    const src = readFileSync(join(SRC_ROOT, "services", "founder-recovery", "dashboard.service.ts"), "utf-8");
    expect(src).toContain('orderBy: { createdAt: "asc" }');
    expect(src).not.toContain("expectedImpactScore");
  });
});
