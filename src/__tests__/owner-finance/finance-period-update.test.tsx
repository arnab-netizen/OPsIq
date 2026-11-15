/**
 * N1 + N6 through the real Money page (jsdom): the owner can open a saved period, complete it, take figures back to UNKNOWN,
 * correct D9 leakage components one at a time — all through the governed amendment route — and a rejected save names its reason.
 *
 * The fake server is faithful where it matters: a rejected create body is validated by the REAL create schema and answered
 * with the same 400 + fieldErrors shape the route produces, and a duplicate period is answered with the real FINANCE_PERIOD_EXISTS
 * 409 body. The page therefore talks to something that behaves like the production endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import { financialSnapshotCreateSchema } from "@/domain/owner-finance/validation";
import { FINANCE_CONFLICT_CODES } from "@/domain/owner-finance/snapshot-conflict";

const BIZ = { id: "biz-a", name: "Acme Bakery", currency: "INR" };

interface Call { method: string; url: string; body: Record<string, unknown> | null }
let calls: Call[] = [];
let rows: Array<Record<string, unknown>> = [];
let canRunFirstRead = true;
let amendMode: "ok" | "superseded" | "reject400" = "ok";
let createMode: "schema" | "exists" | "boom500" = "schema";
let dashboardTargetId: string | null = null;
let diagnosisStatus = 201;

const row = (o: Record<string, unknown> = {}) => ({
  id: "snap-1", businessId: BIZ.id, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z", currency: "INR", version: 1,
  revenue: null, fixedCosts: 40_000, variableCosts: 30_000, cashOnHand: 20_000, discountAmount: null,
  leakageCompVersion: 1, refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost: null, ...o,
});

function serverFieldErrors(body: Record<string, unknown>) {
  const r = financialSnapshotCreateSchema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

const respond = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json }) as Response;

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, url, body });

    if (url.includes("/api/owner/businesses") && method === "GET") return respond(200, { businesses: [BIZ] });
    if (url.includes("/api/owner/onboarding")) return respond(200, { found: true, canRunFirstDiagnosis: canRunFirstRead });
    if (url.includes("/api/owner/finance/dashboard")) {
      return respond(200, {
        businesses: [BIZ], selectedBusinessId: BIZ.id, hasData: false, missingCriticalData: [],
        latestSnapshot: rows[0] ?? null, diagnosisTargetSnapshot: dashboardTargetId ? { id: dashboardTargetId } : rows[0] ?? null,
      });
    }
    if (/\/finance\/businesses\/[^/]+\/snapshots$/.test(url) && method === "GET") return respond(200, rows);
    if (/\/finance\/businesses\/[^/]+\/snapshots$/.test(url) && method === "POST") {
      if (createMode === "exists") {
        return respond(409, { error: "A financial snapshot for this business and reporting period already exists. Amend it instead of creating a duplicate.", code: FINANCE_CONFLICT_CODES.PERIOD_EXISTS, snapshotId: "snap-1" });
      }
      if (createMode === "boom500") {
        return respond(500, { error: "Invalid `prisma.ownerFinancialSnapshot.create()` invocation: Unique constraint failed on the fields: (`business_id`,`period_start`)" });
      }
      const errs = serverFieldErrors(body ?? {});
      if (errs) return respond(400, { error: "Validation failed", fieldErrors: errs });
      return respond(201, { id: "snap-new" });
    }
    if (/\/finance\/snapshots\/[^/]+\/amend$/.test(url) && method === "POST") {
      if (amendMode === "superseded") return respond(409, { error: "Snapshot snap-1 has already been superseded by snap-9. Amend the latest version instead.", code: FINANCE_CONFLICT_CODES.SUPERSEDED, currentSnapshotId: "snap-9" });
      if (amendMode === "reject400") return respond(400, { error: "Validation failed", fieldErrors: [{ path: "fixedCosts", message: "Total fixed costs (41000) is less than the rent, payroll and utilities you entered (50000)" }] });
      return respond(201, { newSnapshotId: "snap-2", previousSnapshotId: "snap-1", version: 2 });
    }
    if (url.endsWith("/diagnoses") && method === "POST") return diagnosisStatus === 429 ? respond(429, { error: "Diagnosis rate limit exceeded. Maximum 10 diagnoses per business per hour." }) : respond(201, { id: "cycle-1" });
    return respond(200, {});
  }));
}

const posts = (re: RegExp) => calls.filter((c) => c.method === "POST" && re.test(c.url));
const amendPosts = () => posts(/\/finance\/snapshots\/[^/]+\/amend$/);
const createPosts = () => posts(/\/finance\/businesses\/[^/]+\/snapshots$/);

function renderPage() {
  return render(<ActiveBusinessProvider><OwnerFinancePage /></ActiveBusinessProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  calls = []; rows = [row()]; canRunFirstRead = true; amendMode = "ok"; createMode = "schema"; dashboardTargetId = null; diagnosisStatus = 201;
  installFetch();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openEditor() {
  const btn = await screen.findByTestId("finance-saved-period-update");
  fireEvent.click(btn);
  return screen.findByTestId("finance-period-editor");
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}( \\(INR\\))?$`)), { target: { value } });

describe("N1 — a saved period with revenue UNKNOWN can be completed later", () => {
  it("is listed with what is known and what is not, even when no first read is possible yet (the audit dead end)", async () => {
    canRunFirstRead = false;
    renderPage();
    const item = await screen.findByTestId("finance-saved-period");
    expect(item.textContent).toMatch(/September 2026/);
    expect(item.textContent).toMatch(/Revenue: not entered/);
    expect(item.textContent).toMatch(/you can add what's missing/);
    expect(within(item).getByTestId("finance-saved-period-update").textContent).toBe("Update this period");
  });

  it("opens prefilled with what is recorded now; adding revenue saves through the amendment route — no duplicate-period create", async () => {
    renderPage();
    const editor = await openEditor();
    expect(within(editor).getByText("Update September 2026")).toBeInTheDocument();
    expect(editor.textContent).toMatch(/Recorded now: not entered/); // revenue
    expect(editor.textContent).toMatch(/Recorded now: INR 40,000/); // fixed costs
    type("Revenue", "80000");
    expect(within(editor).getByTestId("finance-period-editor-changes").textContent).toMatch(/Revenue: not entered → INR 80,000/);
    dashboardTargetId = "snap-2";
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));

    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    const call = amendPosts()[0];
    expect(call.url).toBe("/api/owner/finance/snapshots/snap-1/amend");
    // ONLY the changed figure + the provenance reason: unrelated figures are never re-sent (they cannot be overwritten).
    expect(Object.keys(call.body!).sort()).toEqual(["amendmentReason", "revenue"]);
    expect(call.body!.revenue).toBe(80_000);
    expect(String(call.body!.amendmentReason)).toMatch(/completed figures/i);
    expect(createPosts()).toHaveLength(0);

    // the corrected period is the one the read rests on → the read is worked out again on the NEW version
    await waitFor(() => expect(posts(/\/diagnoses$/)).toHaveLength(1));
    expect(posts(/\/diagnoses$/)[0].body).toEqual({ snapshotId: "snap-2" });
    const notice = await screen.findByTestId("finance-update-notice");
    expect(notice.textContent).toMatch(/Saved as a correction/);
    expect(notice.textContent).toMatch(/earlier figures are kept as history/);
    expect(notice.textContent).toMatch(/worked out your read again/);
    expect(screen.queryByTestId("finance-period-editor")).toBeNull();
  });

  it("an amended period that is NOT the one the current read rests on does not trigger a diagnosis, and says so", async () => {
    renderPage();
    const editor = await openEditor();
    type("Revenue", "10");
    dashboardTargetId = "some-other-snapshot";
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    const notice = await screen.findByTestId("finance-update-notice");
    expect(notice.textContent).toMatch(/isn't the period your current read is based on/);
    expect(posts(/\/diagnoses$/)).toHaveLength(0);
  });

  it("when the re-run is rate-limited the correction is still saved and the owner is told to wait (not invited to re-run now)", async () => {
    diagnosisStatus = 429;
    renderPage();
    const editor = await openEditor();
    type("Revenue", "80000");
    dashboardTargetId = "snap-2";
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    const notice = await screen.findByTestId("finance-update-notice");
    expect(notice.textContent).toMatch(/Saved as a correction/);
    expect(notice.textContent).toMatch(/several times in the last hour/);
    expect(notice.textContent).not.toMatch(/rate limit|429/i);
  });

  it("known → UNKNOWN: ticking “I don't know” sends null, never 0", async () => {
    renderPage();
    const editor = await openEditor();
    fireEvent.click(within(editor).getByTestId("finance-period-unknown-cashOnHand"));
    expect(within(editor).getByTestId("finance-period-editor-changes").textContent).toMatch(/Cash in hand: INR 20,000 → not known \(back to unknown\)/);
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    const body = amendPosts()[0].body!;
    expect(body.cashOnHand).toBeNull();
    expect(body.cashOnHand).not.toBe(0);
    expect(Object.keys(body).sort()).toEqual(["amendmentReason", "cashOnHand"]);
  });

  it("an explicit 0 is a known zero and is sent as 0; a blank is not sent at all", async () => {
    renderPage();
    const editor = await openEditor();
    type("Revenue", "0");
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    expect(amendPosts()[0].body!.revenue).toBe(0);
  });

  it("restating a figure that is already recorded is not a change: nothing can be saved", async () => {
    renderPage();
    const editor = await openEditor();
    type("Fixed costs", "40000");
    expect(within(editor).getByTestId("finance-period-editor-same")).toBeInTheDocument();
    expect((within(editor).getByTestId("finance-period-editor-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(amendPosts()).toHaveLength(0);
  });

  it("adding a period that already exists is not a dead end: the owner is offered the update, carrying what they typed", async () => {
    createMode = "exists";
    renderPage();
    fireEvent.click(await screen.findByText("+ Add financial snapshot"));
    fireEvent.change(await screen.findByLabelText("These numbers cover: from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("These numbers cover: to"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("How reliable are these numbers?"), { target: { value: "ACTUAL" } });
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "80000" } });
    fireEvent.click(screen.getByText("Save snapshot"));

    const alert = await screen.findByTestId("snapshot-save-error");
    expect(alert.textContent).toMatch(/already have figures saved for this period/);
    expect(alert.textContent).toMatch(/Update that period instead/);
    expect(alert.textContent).not.toMatch(/409|conflict|amend|duplicate/i); // the owner never needs to know what a 409 is

    fireEvent.click(within(alert).getByTestId("snapshot-update-existing-period"));
    const editor = await screen.findByTestId("finance-period-editor");
    expect((within(editor).getByLabelText(/^Revenue/) as HTMLInputElement).value).toBe("80000"); // carried over
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    expect(amendPosts()[0].body!.revenue).toBe(80_000);
    expect(createPosts()).toHaveLength(1); // the one rejected attempt; never retried as an add
  });

  it("a stale form (the version was replaced meanwhile) changes nothing, says so in owner words, and offers the latest figures", async () => {
    amendMode = "superseded";
    renderPage();
    const editor = await openEditor();
    type("Revenue", "5");
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    const err = await screen.findByTestId("finance-period-editor-error");
    expect(err.textContent).toMatch(/updated after you opened them, so nothing was changed/);
    expect(err.textContent).not.toMatch(/superseded|snap-9|snap-1|409/i);
    const dashboardLoadsBefore = calls.filter((c) => c.url.includes("/finance/dashboard")).length;
    fireEvent.click(within(err).getByText("Show the latest figures"));
    await waitFor(() => expect(screen.queryByTestId("finance-period-editor")).toBeNull());
    await waitFor(() => expect(calls.filter((c) => c.url.includes("/finance/dashboard")).length).toBeGreaterThan(dashboardLoadsBefore));
  });

  it("a negative figure is refused by the form before any request, with the reason", async () => {
    renderPage();
    const editor = await openEditor();
    type("Revenue", "-5");
    expect((within(editor).getByTestId("finance-period-editor-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(editor.textContent).toMatch(/can't be negative/);
    expect((within(editor).getByLabelText(/^Revenue/) as HTMLInputElement).value).toBe("-5");
    expect(amendPosts()).toHaveLength(0);
  });

  it("a server-side rejection of an amendment (a contradiction the merge would introduce) is shown under the field, focused, values kept", async () => {
    amendMode = "reject400";
    renderPage();
    const editor = await openEditor();
    type("Fixed costs", "41000");
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    const err = await screen.findByTestId("finance-period-editor-error");
    expect(err.textContent).toMatch(/Nothing was saved/);
    const input = within(editor).getByLabelText(/^Fixed costs/) as HTMLInputElement;
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(input.getAttribute("aria-describedby")!.split(" ")[0])?.textContent).toMatch(/Total fixed costs \(41000\) is less than the rent, payroll and utilities you entered \(50000\)/);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("41000");
  });
});

describe("D9 — leakage components amend independently through the UI", () => {
  it("component-aware: taking ONE component back to UNKNOWN sends only that component; the others are not in the request", async () => {
    rows = [row({ refundAmount: 100, reworkCost: 200, complaintCost: 300, refundReworkCost: 600, discountAmount: 50 })];
    renderPage();
    const editor = await openEditor();
    fireEvent.click(within(editor).getByTestId("finance-period-unknown-reworkCost"));
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    expect(amendPosts()[0].body).toMatchObject({ reworkCost: null });
    expect(Object.keys(amendPosts()[0].body!).sort()).toEqual(["amendmentReason", "reworkCost"]);
  });

  it("component-aware: UNKNOWN → known for one component, and an explicit 0 stays a 0 (distinct from unknown)", async () => {
    rows = [row({ refundAmount: 100, reworkCost: null, complaintCost: null, refundReworkCost: 100 })];
    renderPage();
    const editor = await openEditor();
    type("Rework cost", "0");
    type("Complaint cost", "45");
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    const body = amendPosts()[0].body!;
    expect(body.reworkCost).toBe(0);
    expect(body.complaintCost).toBe(45);
    expect("refundAmount" in body).toBe(false);
  });

  it("a legacy combined figure cannot be corrected one component at a time — blocked before any request, with the reason", async () => {
    rows = [row({ leakageCompVersion: null, refundAmount: null, reworkCost: null, complaintCost: null, refundReworkCost: 5000 })];
    renderPage();
    const editor = await openEditor();
    expect(within(editor).getByTestId("finance-period-editor-legacy").textContent).toMatch(/one combined figure/);
    type("Refund amount", "100");
    expect(within(editor).getByTestId("finance-period-editor-problem").textContent).toMatch(/can't be corrected one at a time/);
    expect((within(editor).getByTestId("finance-period-editor-submit") as HTMLButtonElement).disabled).toBe(true);
    // a full restatement: two numbers + one "I don't know"
    type("Rework cost", "0");
    fireEvent.click(within(editor).getByTestId("finance-period-unknown-complaintCost"));
    expect(within(editor).queryByTestId("finance-period-editor-problem")).toBeNull();
    fireEvent.click(within(editor).getByTestId("finance-period-editor-submit"));
    await waitFor(() => expect(amendPosts()).toHaveLength(1));
    expect(amendPosts()[0].body).toMatchObject({ refundAmount: 100, reworkCost: 0, complaintCost: null });
  });
});

async function openAddForm() {
  fireEvent.click(await screen.findByText("+ Add financial snapshot"));
  fireEvent.change(await screen.findByLabelText("These numbers cover: from"), { target: { value: "2026-08-01" } });
  fireEvent.change(screen.getByLabelText("These numbers cover: to"), { target: { value: "2026-08-31" } });
  fireEvent.change(screen.getByLabelText("How reliable are these numbers?"), { target: { value: "ACTUAL" } });
}
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("N6 — each of the six contradictions tells the owner what is wrong, next to the field", () => {
  const CASES: Array<{ name: string; fill: () => void; label: string; says: RegExp }> = [
    { name: "repeat customers > total customers", fill: () => { fireEvent.change(field("Customer count"), { target: { value: "10" } }); fireEvent.change(field("Repeat customers"), { target: { value: "25" } }); }, label: "Repeat customers", says: /Repeat customers \(25\) cannot be more than total customers \(10\)/ },
    { name: "overdue receivables > total receivables", fill: () => { fireEvent.change(field("Receivables"), { target: { value: "1000" } }); fireEvent.change(field("Receivables overdue"), { target: { value: "1500" } }); }, label: "Receivables overdue", says: /Overdue receivables \(1500\) cannot be more than total receivables \(1000\)/ },
    { name: "overdue payables > total payables", fill: () => { fireEvent.change(field("Payables"), { target: { value: "800" } }); fireEvent.change(field("Payables overdue"), { target: { value: "900" } }); }, label: "Payables overdue", says: /Overdue payables \(900\) cannot be more than total payables \(800\)/ },
    { name: "fixed-cost components > total fixed costs", fill: () => { fireEvent.change(field("Fixed costs"), { target: { value: "1000" } }); fireEvent.change(field("Rent"), { target: { value: "700" } }); fireEvent.change(field("Salary / payroll"), { target: { value: "600" } }); fireEvent.change(field("Utilities"), { target: { value: "100" } }); }, label: "Fixed costs", says: /Total fixed costs \(1000\) is less than the rent, payroll and utilities you entered \(1400\)/ },
    { name: "B2C + B2B revenue > total revenue", fill: () => { fireEvent.change(field("Revenue"), { target: { value: "5000" } }); fireEvent.change(field("B2C revenue"), { target: { value: "4000" } }); fireEvent.change(field("B2B revenue"), { target: { value: "2000" } }); }, label: "Revenue", says: /Revenue \(5000\) is less than the consumer and business revenue you entered \(6000\)/ },
  ];

  for (const c of CASES) {
    it(c.name, async () => {
      renderPage();
      await openAddForm();
      c.fill();
      const typedBefore = Array.from(document.querySelectorAll("form input")).map((i) => (i as HTMLInputElement).value);
      fireEvent.click(screen.getByText("Save snapshot"));

      const alert = await screen.findByTestId("snapshot-save-error");
      expect(alert.textContent).toMatch(/Nothing was saved/);
      expect(alert.textContent).not.toMatch(/try (saving )?again/i);
      expect(alert.textContent).not.toMatch(/couldn.t save this snapshot/i); // no generic fallback for a known reason
      // the specific reason sits under the offending field, which is flagged and focused
      const input = field(c.label);
      await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
      expect(document.getElementById(input.getAttribute("aria-describedby")!.split(" ")[0])?.textContent).toMatch(c.says);
      expect(document.activeElement).toBe(input);
      // a field inside a collapsed section is opened so the owner can see it
      const details = input.closest("details");
      if (details) expect(details.open).toBe(true);
      // everything typed is still there
      expect(Array.from(document.querySelectorAll("form input")).map((i) => (i as HTMLInputElement).value)).toEqual(typedBefore);
      // and nothing technical
      expect(document.body.textContent).not.toMatch(/periodEnd|periodStart|repeatCustomerCount|Validation failed|zod/);
    });
  }

  it("reversed date range", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("+ Add financial snapshot"));
    fireEvent.change(await screen.findByLabelText("These numbers cover: from"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("These numbers cover: to"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("How reliable are these numbers?"), { target: { value: "ACTUAL" } });
    fireEvent.change(field("Revenue"), { target: { value: "123" } });
    fireEvent.click(screen.getByText("Save snapshot"));
    const alert = await screen.findByTestId("snapshot-save-error");
    expect(alert.textContent).toMatch(/Nothing was saved/);
    const end = field("These numbers cover: to");
    await waitFor(() => expect(end.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(end.getAttribute("aria-describedby")!.split(" ")[0])?.textContent).toBe("The end of the period can't be before its start. Check both dates.");
    expect(document.activeElement).toBe(end);
    expect(field("These numbers cover: from").value).toBe("2026-08-31");
    expect(field("Revenue").value).toBe("123");
  });

  it("a 500 never leaks technical text and keeps the entries; the generic line is only for genuinely unknown failures", async () => {
    createMode = "boom500";
    renderPage();
    await openAddForm();
    fireEvent.change(field("Revenue"), { target: { value: "123" } });
    fireEvent.click(screen.getByText("Save snapshot"));
    const alert = await screen.findByTestId("snapshot-save-error");
    expect(alert.textContent).toMatch(/couldn.t save this snapshot/i);
    expect(alert.textContent).toMatch(/entries are still here/i);
    expect(document.body.textContent).not.toMatch(/prisma|Unique constraint|business_id|period_start|invocation/i);
    expect(field("Revenue").value).toBe("123");
  });
});
