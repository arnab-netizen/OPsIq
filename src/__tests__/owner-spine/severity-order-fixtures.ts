/**
 * Shared mocked-db fixture for the finding severity-order regression tests.
 *
 * Root cause under test: finding `severity` is a plain String column, so a DB
 * `orderBy: { severity: "asc" }` returns critical, high, LOW, MEDIUM. Every
 * owner-facing reader must rank after read (rankOwnerFindingsBySeverity).
 *
 * `fakeDb` returns findings in that alphabetical DB order and records every
 * query argument so tests can also assert no reader asks the DB to sort by
 * severity. Must not import `@/lib/db`.
 */
import { vi } from "vitest";

const base = {
  workspaceId: "ws-1",
  businessId: "b-1",
  cycleId: "c-1",
  findingType: "risk",
  summary: "summary",
  sourceMetric: "metric",
  sourceValue: 1,
  threshold: 2,
  urgencyScore: 50,
  confidence: 0.8,
  evidence: [],
  missingData: [],
};

/** Findings in the order an alphabetical `severity` sort returns them. */
export const ALPHABETICAL_DB_FINDINGS = [
  { ...base, id: "f-crit", code: "F_CRIT", title: "Critical", severity: "critical", impactScore: 10 },
  { ...base, id: "f-high", code: "F_HIGH", title: "High", severity: "high", impactScore: 10 },
  // Highest impact of all: proves severity outranks impact.
  { ...base, id: "f-low", code: "F_LOW", title: "Low", severity: "low", impactScore: 99 },
  { ...base, id: "f-med-x", code: "F_MED_X", title: "Medium X", severity: "medium", impactScore: 40 },
  { ...base, id: "f-med-y", code: "F_MED_Y", title: "Medium Y", severity: "medium", impactScore: 80 },
];

/** Canonical order: severity → impact → urgency → confidence → code. */
export const CANONICAL_CODES = ["F_CRIT", "F_HIGH", "F_MED_Y", "F_MED_X", "F_LOW"];

export const BUSINESS = { id: "b-1", name: "Biz", businessType: "retail", currency: "INR", isActive: true };

const queryArgs: unknown[] = [];

function cycleRow() {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "c-1",
    workspaceId: "ws-1",
    businessId: "b-1",
    sequenceNumber: 1,
    cycleNumber: 1,
    snapshot: null,
    findings: ALPHABETICAL_DB_FINDINGS.map((f) => ({ ...f })),
    actions: [],
    generatedAt: now,
    createdAt: now,
  };
}

function model(name: string) {
  const record = (args: unknown) => {
    queryArgs.push(args);
  };
  return {
    findFirst: vi.fn(async (args: unknown) => {
      record(args);
      return name.endsWith("Cycle") ? cycleRow() : null;
    }),
    findUnique: vi.fn(async (args: unknown) => {
      record(args);
      return null;
    }),
    findMany: vi.fn(async (args: unknown) => {
      record(args);
      if (name.endsWith("Finding") || name === "finding") return ALPHABETICAL_DB_FINDINGS.map((f) => ({ ...f }));
      return [];
    }),
  };
}

const models = new Map<string, ReturnType<typeof model>>();

/** Prisma-shaped proxy: any `db.<model>` resolves to a recording fake. */
export const fakeDb: Record<string, ReturnType<typeof model>> = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (!models.has(prop)) models.set(prop, model(prop));
      return models.get(prop);
    },
  }
);

export const businessServiceMock = {
  listBusinesses: vi.fn(async () => [BUSINESS]),
  getBusiness: vi.fn(async () => BUSINESS),
};

export function resetFakeDb(): void {
  queryArgs.length = 0;
}

/** True when any recorded query asked the DB to order by the string severity column. */
export function anyQueryOrdersBySeverity(): boolean {
  return /"severity":"(asc|desc)"/.test(JSON.stringify(queryArgs));
}

export function codes(findings: Array<{ code: string }>): string[] {
  return findings.map((f) => f.code);
}
