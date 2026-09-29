/**
 * /diagnosis UI: server-side access gate, figure parsing, answer-first layout, client submit.
 *
 * - The page renders the form only for actors holding ENGAGEMENT_CREATE (the capability
 *   POST /api/diagnosis requires, derived by the real capability layer from a mocked policy) in a
 *   workspace whose plan includes "create_engagement" (the check diagnoseBusiness enforces);
 *   a self-serve owner gets the Owner redirect state; an unentitled workspace is told so; any
 *   other role gets a truthful denial; a missing or failing policy lookup fails closed.
 * - Blank figures are unknown (omitted from the request), never 0.
 * - The answer view leads with the main problem and keeps the contract's section order.
 * - A 403 from the API is presented as a permission problem, not a generic failure.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { parseOptionalFigure } from "@/domain/generic-diagnosis/form";
import { buildGenericDiagnosisAnswer } from "@/domain/generic-diagnosis/answer";
import { DiagnosisAnswerView } from "@/components/diagnosis/DiagnosisAnswerView";
import DiagnosisClient from "@/components/diagnosis/DiagnosisClient";

const auth = vi.hoisted(() => ({ policy: null as unknown, throws: false, planAllows: true, planWorkspace: "" }));
vi.mock("@/services/auth", () => ({
  getPolicyContext: vi.fn(async () => {
    if (auth.throws) throw new Error("session store unavailable");
    return auth.policy;
  }),
}));
vi.mock("@/services/entitlement.service", () => ({
  assertCapability: vi.fn(async (workspaceId: string, key: string) => {
    auth.planWorkspace = `${workspaceId}:${key}`;
    return auth.planAllows ? { allowed: true, usage: 0, limit: null } : { allowed: false, reason: "Capability 'create_engagement' not found in plan" };
  }),
}));

const policy = (role: string, workspaceRole: string) => ({
  userId: "u1",
  roles: [{ role, scope: "workspace", scopeId: "ws1" }],
  engagementMemberships: [],
  workspaceRole,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.policy = null;
  auth.throws = false;
  auth.planAllows = true;
  auth.planWorkspace = "";
});

async function renderPage() {
  const { default: DiagnosisPage } = await import("@/app/(authenticated)/diagnosis/page");
  render(await DiagnosisPage());
}

describe("/diagnosis page — server-side access gate agrees with the API capability", () => {
  it("consultant/admin (ENGAGEMENT_CREATE) gets the form", async () => {
    auth.policy = policy("admin_or_portfolio_manager", "admin");
    await renderPage();
    expect(screen.getByRole("button", { name: "Run diagnosis" })).toBeTruthy();
    expect(screen.queryByTestId("diagnosis-access-denied")).toBeNull();
    expect(auth.planWorkspace).toBe("ws1:create_engagement"); // the workspace the policy was resolved for
  });

  it("consultant in a workspace whose plan lacks engagements is told so, no form", async () => {
    auth.policy = policy("admin_or_portfolio_manager", "admin");
    auth.planAllows = false;
    await renderPage();
    expect(screen.getByTestId("diagnosis-access-denied").getAttribute("data-access")).toBe("not_in_plan");
    expect(screen.getByText("Quick diagnosis isn't included in this workspace's plan.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run diagnosis" })).toBeNull();
  });

  it("self-serve owner gets a truthful consultant-tool state that links to their Owner diagnosis", async () => {
    auth.policy = policy("admin_or_portfolio_manager", "owner");
    await renderPage();
    const denied = screen.getByTestId("diagnosis-access-denied");
    expect(denied.getAttribute("data-access")).toBe("owner");
    expect(screen.getByText("This is a consultant tool and isn't part of your Owner account.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Diagnose my finances →" }).getAttribute("href")).toBe("/owner/finance");
    expect(screen.queryByRole("button", { name: "Run diagnosis" })).toBeNull();
  });

  it("viewer gets a truthful denial, no form", async () => {
    auth.policy = policy("viewer", "member");
    await renderPage();
    expect(screen.getByTestId("diagnosis-access-denied").getAttribute("data-access")).toBe("denied");
    expect(screen.getByText("You don't have access to the quick diagnosis tool.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run diagnosis" })).toBeNull();
  });

  it("no policy fails closed as denied; a failing lookup says access couldn't be checked (not 'no access')", async () => {
    await renderPage();
    expect(screen.getByTestId("diagnosis-access-denied").getAttribute("data-access")).toBe("denied");
    cleanup();
    auth.throws = true;
    await renderPage();
    expect(screen.getByTestId("diagnosis-access-denied").getAttribute("data-access")).toBe("unavailable");
    expect(screen.getByText("Couldn't check your access right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run diagnosis" })).toBeNull();
  });

  it("a consultant without client-creation access is told up front they can only diagnose existing clients", async () => {
    auth.policy = policy("experienced_consultant", "member");
    await renderPage();
    expect(screen.getByRole("button", { name: "Run diagnosis" })).toBeTruthy();
    expect(screen.getByText(/Only businesses that are already clients in this workspace can be diagnosed/)).toBeTruthy();
    cleanup();
    auth.policy = policy("admin_or_portfolio_manager", "admin");
    await renderPage();
    expect(screen.queryByText(/Only businesses that are already clients/)).toBeNull();
  });
});

describe("parseOptionalFigure — unknown is never zero", () => {
  it("blank / missing → unknown; 0 → zero", () => {
    expect(parseOptionalFigure("", "Revenue")).toEqual({ ok: true, value: undefined });
    expect(parseOptionalFigure("   ", "Revenue")).toEqual({ ok: true, value: undefined });
    expect(parseOptionalFigure(null, "Revenue")).toEqual({ ok: true, value: undefined });
    expect(parseOptionalFigure("0", "Revenue")).toEqual({ ok: true, value: 0 });
  });
  it("accepts plain and correctly grouped numbers", () => {
    expect(parseOptionalFigure("200000", "Revenue")).toEqual({ ok: true, value: 200000 });
    expect(parseOptionalFigure("200,000", "Revenue")).toEqual({ ok: true, value: 200000 });
    expect(parseOptionalFigure("1,250,000.50", "Revenue")).toEqual({ ok: true, value: 1250000.5 });
  });
  it("rejects anything it would otherwise have to guess at", () => {
    for (const raw of ["-5", "12abc", "$100", "1,5", "1e6", "NaN", "Infinity"]) {
      const parsed = parseOptionalFigure(raw, "Revenue");
      expect(parsed.ok, raw).toBe(false);
    }
    expect(parseOptionalFigure("12.5", "Customer count", { integer: true })).toEqual({
      ok: false,
      message: "Customer count: enter a whole number.",
    });
  });
});

describe("DiagnosisAnswerView — answer first, contract order", () => {
  it("leads with the main problem and keeps the section order; exactly one first step", () => {
    const answer = buildGenericDiagnosisAnswer({
      businessName: "ZZ-TEST-SANDBOX",
      businessType: "bakery",
      problemStatement: "Costs keep rising.",
      mainIssue: "high_costs",
      monthlyRevenue: 200000,
      monthlyCosts: 260000,
      customerCount: 800,
    });
    const { container } = render(<DiagnosisAnswerView answer={answer} engagementCode="ZZT-001" interventionMode="recovery" />);
    const text = container.textContent ?? "";
    const order = [
      "Main problem",
      answer.mainProblem.headline,
      "Why OpsIQ thinks this",
      "Evidence",
      "How sure OpsIQ is",
      "What this means",
      "Do this first",
      answer.firstStep.title,
      "Then",
      "Don't do yet",
      "What OpsIQ still needs",
    ];
    const positions = order.map((label) => text.indexOf(label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.startsWith("Main problem")).toBe(true);
    expect(text.match(/Do this first/g)).toHaveLength(1);
    // Owner estimates are labelled as such, never as verified.
    const verified = text.match(/[a-z ]*verified/gi) ?? [];
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((m) => /not independently verified$/i.test(m))).toBe(true);
  });
});

describe("DiagnosisClient — submit", () => {
  function fill(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) {
      const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
      fireEvent.change(el, { target: { value } });
    }
  }
  const base = { businessName: "ZZ-TEST-SANDBOX", businessType: "bakery", problemStatement: "Not sure.", mainIssue: "unclear" };

  it("omits blank figures from the request (unknown, not 0) and sends a 0 that was typed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DiagnosisClient canAddClients />);
    fill({ ...base, monthlyRevenue: "0" });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/diagnosis");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["idempotency-key"]).toMatch(/^diagnosis-/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ businessName: "ZZ-TEST-SANDBOX", mainIssue: "unclear" });
    expect(body.monthlyRevenue).toBe(0);
    expect("monthlyCosts" in body).toBe(false);
    expect("customerCount" in body).toBe(false);
  });

  it("the main concern must be chosen — it never silently defaults to 'Low sales'", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DiagnosisClient canAddClients />);
    expect((document.querySelector('[name="mainIssue"]') as HTMLSelectElement).value).toBe("");
    fill({ businessName: "ZZ-TEST-SANDBOX", businessType: "bakery", problemStatement: "Not sure." });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));
    expect((await screen.findByTestId("diagnosis-error")).textContent).toBe("Choose the main concern (or “Not sure yet”).");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an invalid figure is reported without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DiagnosisClient canAddClients />);
    fill({ ...base, customerCount: "12.5" });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));
    expect((await screen.findByTestId("diagnosis-error")).textContent).toBe("Customer count: enter a whole number.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without client-creation access, a 403 explains the new-client rule", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 403 })));
    render(<DiagnosisClient canAddClients={false} />);
    fill(base);
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));
    const alert = await screen.findByTestId("diagnosis-error");
    expect(alert.textContent).toMatch(/^You don't have permission to do this\. If this business isn't a client yet, adding it needs client-creation access/);
  });

  it("a 403 is shown as a permission problem, not a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403 })));
    render(<DiagnosisClient canAddClients />);
    fill(base);
    fireEvent.click(screen.getByRole("button", { name: "Run diagnosis" }));
    const alert = await screen.findByTestId("diagnosis-error");
    expect(alert.textContent).toMatch(/permission/i);
    expect(alert.textContent).not.toMatch(/Couldn't process this action/);
    expect((screen.getByRole("button", { name: "Run diagnosis" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
