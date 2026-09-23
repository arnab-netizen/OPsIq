/**
 * Owner Evidence & Trust page (/owner/trust) — UX-06 Wave B (Sections G.1-G.3, U).
 *
 * Proves the narrowly-scoped Trust-only fix: raw findingType/eventName/entityType no longer
 * render as primary text (replaced by accurate, readable labels, with a safe generic reformat
 * for values with no curated mapping); the raw finding code/entity id/event/entity-type values
 * remain fully reachable via the existing keyboard-accessible Disclosure pattern (never dropped
 * to an object-only value); unknown/malformed values render an honest neutral label without
 * crashing; and Trust's three load paths now route through the same governed
 * classifyOperatorError() classifier every other audited owner page already uses, with the
 * rendered role="alert" text asserted directly (never merely that a classifier was invoked).
 *
 * `fireEvent.click` on a <summary> is used to test the Disclosure toggle's resulting DOM state
 * (open/closed, content reachable) -- jsdom's native <details>/<summary> click-toggle behavior is
 * a real DOM mechanism, not a React event handler, so this proves the actual open/close outcome.
 * It does not prove genuine keyboard Space/Enter activation of a focused <summary> in a real
 * browser -- that is verified separately via live Chromium (see the PR report).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, within } from "@testing-library/react";
import OwnerTrustPage from "@/app/(authenticated)/owner/trust/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { hasOperatorUnsafeContent } from "@/lib/operator-error-governance";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-TRUST-BIZ", currency: "USD" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function failing(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

function explanationCard(overrides: Record<string, unknown> = {}) {
  return {
    domain: "finance",
    findingCode: "FIN_LOW_MARGIN_002",
    findingType: "opportunity",
    severity: "medium",
    whatWasDetected: "Margin below target",
    whyItMatters: "Cash runway shortens if this continues.",
    sourceDataUsed: { metric: "netMarginPct", valueLabel: "8%", thresholdLabel: "15%", evidence: [] },
    calculationUsed: "netMarginPct = 8, below the 15 threshold.",
    confidence: { score: 82, label: "high" },
    riskIfIgnored: "Continued margin erosion.",
    expectedImpact: { score: 60, label: "moderate" },
    verification: { method: "compare_before_after", metric: "netMarginPct" },
    dataGaps: [],
    hasInventedValues: false,
    ...overrides,
  };
}

function cyclesFixture(cycles: unknown[] = [{ domain: "finance", cycleId: "cycle-1", sequenceNumber: 1, generatedAt: "2026-01-01T00:00:00.000Z" }]) {
  return { businesses: [BIZ_A], selectedBusinessId: BIZ_A.id, cycles };
}

let cyclesBehavior: "ok" | "fail500" | "failRaw";
let explanationsBehavior: "ok" | "fail500" | "failRaw";
let auditBehavior: "ok" | "fail500" | "failRaw";
let explanationCards: unknown[];
let auditFixture: { entityId: string; events: unknown[] };

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/api/owner/businesses")) return ok({ businesses: [BIZ_A] });

      if (url.includes("/api/owner/trust/cycles")) {
        if (cyclesBehavior === "fail500") return failing(500, { error: "database connection pool exhausted" });
        if (cyclesBehavior === "failRaw") return failing(400, {});
        return ok(cyclesFixture());
      }

      if (url.includes("/api/owner/trust/explanations")) {
        if (explanationsBehavior === "fail500") return failing(500, { error: "PrismaClientKnownRequestError" });
        if (explanationsBehavior === "failRaw") return failing(400, {});
        return ok({ explanations: explanationCards });
      }

      if (url.includes("/api/owner/trust/audit-trail")) {
        if (auditBehavior === "fail500") return failing(500, { error: "database connection terminated unexpectedly" });
        if (auditBehavior === "failRaw") return failing(400, {});
        return ok(auditFixture);
      }

      return ok({});
    })
  );
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerTrustPage />
    </ActiveBusinessProvider>
  );
}

beforeEach(() => {
  cyclesBehavior = "ok";
  explanationsBehavior = "ok";
  auditBehavior = "ok";
  explanationCards = [explanationCard()];
  auditFixture = {
    entityId: "cycle-1",
    events: [
      { id: "evt-1", eventName: "task.completed", entityType: "delegated_task", occurredAt: "2026-01-02T00:00:00.000Z" },
      { id: "evt-2", eventName: "legacy_module.unmapped_event_v1", entityType: "SomeFutureEntityType", occurredAt: "2026-01-03T00:00:00.000Z" },
    ],
  };
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Trust page — finding type/code labeling (Section G.1)", () => {
  it("shows a plain-language finding-type label as primary text, never the raw value or the finding code", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());

    const primaryLine = screen.getByText(/Finance · Opportunity/);
    expect(primaryLine).toBeInTheDocument();
    expect(primaryLine.textContent).not.toContain("opportunity");
    expect(primaryLine.textContent).not.toContain("FIN_LOW_MARGIN_002");
  });

  it("keeps the raw finding type and finding code fully accessible via the disclosure, not deleted", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());

    const disclosure = screen.getByText("Technical reference").closest("details") as HTMLDetailsElement;
    expect(disclosure).not.toBeNull();
    expect(disclosure.open).toBe(false); // closed by default

    fireEvent.click(within(disclosure).getByText("Technical reference"));
    expect(disclosure.open).toBe(true);
    expect(within(disclosure).getByText("opportunity")).toBeInTheDocument();
    expect(within(disclosure).getByText("FIN_LOW_MARGIN_002")).toBeInTheDocument();
  });

  it("falls back to a safe generic label (never the raw value, never a guess) for an unmapped findingType", async () => {
    explanationCards = [explanationCard({ findingType: "warning" })];
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());

    expect(screen.getByText(/Finance · Warning/)).toBeInTheDocument();
  });

  it("never crashes and shows the honest neutral label for a missing/null findingType", async () => {
    explanationCards = [explanationCard({ findingType: null, findingCode: null })];
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());

    expect(screen.getByText(/Finance · Unknown/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Technical reference"));
    // "—" placeholders for the missing technical values, never a thrown error or blank render.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("Owner Trust page — audit trail labeling (Sections G.2, G.3)", () => {
  async function openAuditTrail() {
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "View audit trail" }));
    await waitFor(() => expect(screen.getByText("Audit trail")).toBeInTheDocument());
  }

  it("never renders the raw entity id as the heading's primary text, but keeps it reachable via disclosure", async () => {
    await openAuditTrail();

    const heading = screen.getByRole("heading", { name: "Audit trail" });
    expect(heading.textContent).toBe("Audit trail");
    expect(heading.textContent).not.toContain("cycle-1");

    // Scoped to the audit section specifically -- the findings list above it renders its own
    // "Technical reference" disclosures too, so an unscoped query could grab the wrong one.
    const auditSection = heading.closest("section") as HTMLElement;
    const entityDisclosure = within(auditSection).getAllByText("Technical reference")[0].closest("details") as HTMLDetailsElement;
    fireEvent.click(within(entityDisclosure).getByText("Technical reference"));
    expect(within(entityDisclosure).getByText("cycle-1")).toBeInTheDocument();
  });

  it("shows an accurate, readable label for a known event/entity-type pair, with the raw values reachable via disclosure", async () => {
    await openAuditTrail();

    const primaryLine = screen.getByText("Task completed").closest("span") as HTMLElement;
    expect(primaryLine).toBeInTheDocument();
    expect(within(primaryLine).getByText(/Delegated task/)).toBeInTheDocument();
    // The raw value is deliberately still in the DOM (inside the closed disclosure below), so the
    // assertion is that it's absent from the PRIMARY line specifically, not from the whole page.
    expect(primaryLine.textContent).not.toContain("task.completed");
  });

  it("handles a historical/unrecognized event+entity-type pair safely: readable reformat, no crash, raw values preserved", async () => {
    await openAuditTrail();

    // "legacy_module.unmapped_event_v1" -> "Legacy module unmapped event v1" (mechanical reformat,
    // not a guessed business meaning) -- proves this codebase does not need to know about a given
    // event ahead of time to label it safely.
    expect(screen.getByText("Legacy module unmapped event v1")).toBeInTheDocument();
    expect(screen.getByText(/Some future entity type/)).toBeInTheDocument();

    const disclosures = screen.getAllByText("Technical reference");
    const rowDisclosure = disclosures[disclosures.length - 1].closest("details") as HTMLDetailsElement;
    fireEvent.click(within(rowDisclosure).getByText("Technical reference"));
    expect(within(rowDisclosure).getByText(/legacy_module\.unmapped_event_v1/)).toBeInTheDocument();
    expect(within(rowDisclosure).getByText(/SomeFutureEntityType/)).toBeInTheDocument();
  });

  it("never crashes and shows the honest neutral label for a missing/null eventName or entityType", async () => {
    auditFixture = {
      entityId: "cycle-1",
      events: [{ id: "evt-null", eventName: null, entityType: undefined, occurredAt: "2026-01-04T00:00:00.000Z" }],
    };
    await openAuditTrail();

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});

describe("Owner Trust page — governed error handling (Section U)", () => {
  it("renders a governed, owner-safe message with role=\"alert\" for a server-side failure -- never the raw server error text", async () => {
    cyclesBehavior = "fail500";
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server is having trouble. We're working on it.");
    expect(alert.textContent).not.toContain("database connection pool exhausted");
    expect(hasOperatorUnsafeContent(alert.textContent ?? "")).toBe(false);
  });

  it("renders a governed generic message for a failure with no server-provided message, on the explanations load path", async () => {
    explanationsBehavior = "failRaw";
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load that data. Please refresh and try again.");
    expect(hasOperatorUnsafeContent(alert.textContent ?? "")).toBe(false);
  });

  it("renders a governed message, never a raw exception string, on the audit-trail load path", async () => {
    auditBehavior = "fail500";
    renderPage();
    await waitFor(() => expect(screen.getByText("Margin below target")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "View audit trail" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server is having trouble. We're working on it.");
    expect(alert.textContent).not.toContain("database connection terminated unexpectedly");
    expect(hasOperatorUnsafeContent(alert.textContent ?? "")).toBe(false);
  });
});
