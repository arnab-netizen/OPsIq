/**
 * Owner Execution (/owner/sop) — UX-06 Wave B1 inline Complete/Verify action forms.
 *
 * Proves the frozen Wave-B interaction contract (UX-06 Section X.2/Z/AA) for the 5
 * window.prompt() call sites this page previously had on its Complete/Verify actions,
 * now replaced by the shared DomainActionInlineForms components. Uses the real page
 * component with mocked network/context, per the existing owner-execution-business--
 * switch-race.test.tsx convention -- the completion/verification handler itself is
 * never mocked away.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerExecutionPage from "@/app/(authenticated)/owner/execution/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";
import { parseOptionalNumericField } from "@/components/owner/DomainActionInlineForms";

const BIZ_A = { id: "11111111-1111-4111-8111-111111111111", name: "ZZ-TEST-FIELD-SERVICE", currency: "USD" };
const BIZ_B = { id: "22222222-2222-4222-8222-222222222222", name: "Trinity Services", currency: "USD" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function action(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    title: "Cut discretionary spend",
    status: "in_progress",
    ownerRole: "owner",
    priorityScore: 1,
    expectedTimeframeDays: 3,
    description: "x",
    // completionRatePct is a known, higher-is-better metric (VERIFICATION_METRIC_DIRECTION,
    // domain/owner-mode/verification-direction.ts) -- unlike the old page-wide "up" constant this
    // replaced, this fixture now actually needs a real up-metric to legitimately pre-fill "up".
    verificationMetric: "completionRatePct",
    verificationMethod: "x",
    ...overrides,
  };
}

function dashboardFixture(label: string, businessId: string, actions: unknown[] = [action()]) {
  return {
    businesses: [BIZ_A, BIZ_B],
    selectedBusinessId: businessId,
    hasData: true,
    latestSnapshot: { id: `snap-${label}` },
    missingCriticalData: [],
    domainScore: null,
    latestCycle: {
      id: `cycle-${label}`,
      sequenceNumber: 1,
      survivalState: "SAFE",
      overallHealthScore: 80,
      survivalRiskScore: 10,
      growthOpportunityScore: 50,
      dataConfidenceScore: 90,
      findings: [],
      actions,
    },
    recommendedNextAction: null,
    cycleHistory: [],
  };
}

function SwitchHarness() {
  const { setActiveBusinessId } = useActiveBusiness();
  return <button data-testid="switch-to-b" onClick={() => setActiveBusinessId(BIZ_B.id)}>switch to B</button>;
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <SwitchHarness />
      <OwnerExecutionPage />
    </ActiveBusinessProvider>
  );
}

interface PendingCall { resolve: (data: unknown) => void; reject: (err: unknown) => void }
let dashboardCallsByBiz: Record<string, PendingCall[]>;
let patchCalls: Array<{ url: string; body: unknown }>;
let verifyCalls: Array<{ url: string; body: unknown }>;
let patchBehavior: "pending" | "ok" | "fail500";
let pendingPatchResolvers: Array<{ resolve: (v: Response) => void }>;

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/owner/businesses")) return ok({ businesses: [BIZ_A, BIZ_B] });

      if (method === "GET" && url.includes("/api/owner/sop/dashboard")) {
        const params = new URL(url, "https://example.com").searchParams;
        const businessId = params.get("businessId")!;
        return new Promise<Response>((resolve, reject) => {
          (dashboardCallsByBiz[businessId] ??= []).push({ resolve: (d) => resolve(ok(d)), reject });
        });
      }
      if (method === "PATCH" && /\/api\/owner\/sop\/actions\/[^/]+$/.test(url)) {
        patchCalls.push({ url, body: JSON.parse((init?.body as string) ?? "{}") });
        if (patchBehavior === "fail500") return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as Response;
        if (patchBehavior === "pending") {
          return new Promise<Response>((resolve) => { pendingPatchResolvers.push({ resolve }); });
        }
        return ok({ status: "completed" });
      }
      if (method === "POST" && /\/api\/owner\/sop\/actions\/[^/]+\/verify$/.test(url)) {
        verifyCalls.push({ url, body: JSON.parse((init?.body as string) ?? "{}") });
        return ok({});
      }
      return ok({});
    })
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function resolveDashboard(businessId: string, data: unknown, occurrence = 0) {
  await waitFor(() => expect((dashboardCallsByBiz[businessId] ?? []).length).toBeGreaterThan(occurrence));
  await act(async () => { dashboardCallsByBiz[businessId]![occurrence]!.resolve(data); });
  await flush();
}

beforeEach(() => {
  dashboardCallsByBiz = {};
  patchCalls = [];
  verifyCalls = [];
  patchBehavior = "ok";
  pendingPatchResolvers = [];
  installFetchMock();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Execution — inline Complete/Verify action forms (UX-06 Wave B1)", () => {
  it("A. Complete click renders the labelled inline form", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

    expect(await screen.findByText("Complete action")).toBeInTheDocument();
    expect(screen.getByLabelText("Completion notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Completion evidence")).toBeInTheDocument();
  });

  it("B. clicking Complete alone sends no request", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await flush();
    expect(patchCalls).toHaveLength(0);
  });

  it("C. Cancel sends no request and closes the form", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await screen.findByText("Complete action");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();
    expect(screen.queryByText("Complete action")).not.toBeInTheDocument();
    expect(patchCalls).toHaveLength(0);
  });

  it("D. valid Save completion sends the same endpoint/method/payload semantics as before", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "  Done via new form  " } });
    fireEvent.change(screen.getByLabelText("Completion evidence"), { target: { value: "  photo.png  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();

    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]!.url).toBe(`/api/owner/sop/actions/${action().id}`);
    expect(patchCalls[0]!.body).toEqual({
      status: "completed",
      // Whitespace preserved verbatim (never trimmed) -- matches the old window.prompt() flow's
      // payload semantics exactly (frozen contract, UX-06 Section Z).
      completionNotes: "  Done via new form  ",
      completionEvidence: ["  photo.png  "],
    });
  });

  it("E. empty completion values preserve \"\" / [] semantics", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();

    expect(patchCalls[0]!.body).toEqual({
      status: "completed",
      completionNotes: "",
      completionEvidence: [],
    });
  });

  it("F. Verify outcome renders Before/After/Target direction fields, pre-filled from the metric's own canonical direction (not a page-wide constant)", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));

    expect(await screen.findByRole("heading", { name: "Verify outcome" })).toBeInTheDocument();
    expect(screen.getByLabelText("Before value")).toBeInTheDocument();
    expect(screen.getByLabelText("After value")).toBeInTheDocument();
    expect(screen.getByLabelText("Target direction")).toHaveValue("up");
  });

  it("G. valid verification sends exact beforeValue/afterValue/targetDirection shape", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    fireEvent.change(screen.getByLabelText("Before value"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("After value"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Target direction"), { target: { value: "down" } });
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();

    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]!.url).toBe(`/api/owner/sop/actions/${action().id}/verify`);
    expect(verifyCalls[0]!.body).toEqual({ beforeValue: 100, afterValue: 80, targetDirection: "down" });
  });

  it("H. blank Before/After submit null, never 0/NaN/\"\"", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();

    expect(verifyCalls[0]!.body).toEqual({ beforeValue: null, afterValue: null, targetDirection: "up" });
  });

  it("I. invalid numeric input never submits a broken value, and the shared validator rejects it directly", async () => {
    // A native type="number" input's own DOM sanitization (confirmed empirically in both jsdom,
    // via fireEvent.change, and real Chromium, via Playwright's real keyboard input) clears
    // anything that doesn't parse to a finite number -- including magnitude overflow like
    // "1e400" -- back to "" the instant it's set, so this page's rendered field can never carry a
    // non-blank, non-finite value into Save in the first place. This test exercises that
    // DOM-sanitization path via fireEvent.change (jsdom), which is why the request below still
    // goes out with safe null semantics. Real Chromium adds a SECOND, stronger, independent
    // guarantee that jsdom does not reproduce: typing an unparseable entry via real keyboard
    // input (e.g. "1e400" or the incomplete exponent "1e") sets the field's own validity.badInput
    // to true, and Chromium's native constraint validation then blocks the "submit" event itself
    // from ever firing -- confirmed via both a real Save-button click and a real Enter keypress,
    // either way with zero network requests and this form's onSubmit never invoked at all. So in
    // Chromium this exact scenario is actually a no-op click, not a null submission -- see
    // DomainActionInlineForms.tsx's parseOptionalNumericField doc comment for the full evidence.
    // (Only Chromium was tested here; other browser engines were not verified.)
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    const beforeInput = screen.getByLabelText("Before value") as HTMLInputElement;
    fireEvent.change(beforeInput, { target: { value: "1e400" } });
    expect(beforeInput.value).toBe(""); // sanitized by the platform before it ever reaches React
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();

    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]!.body).toEqual({ beforeValue: null, afterValue: null, targetDirection: "up" });

    // Direct proof the same validator this form uses rejects a non-blank, non-finite value outright
    // (the exact case the DOM makes unreachable through normal interaction).
    expect(parseOptionalNumericField("1e400")).toEqual({ valid: false });
    expect(parseOptionalNumericField("")).toEqual({ valid: true, value: null });
    expect(parseOptionalNumericField("12.5")).toEqual({ valid: true, value: 12.5 });
  });

  it("Q. a lower-is-better metric (overdueRatePct) pre-fills \"down\", not a page-wide constant", async () => {
    renderPage();
    await resolveDashboard(
      BIZ_A.id,
      dashboardFixture("A", BIZ_A.id, [action({ verificationMetric: "overdueRatePct" })])
    );
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    expect(screen.getByLabelText("Target direction")).toHaveValue("down");

    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();
    expect(verifyCalls[0]!.body).toEqual({ beforeValue: null, afterValue: null, targetDirection: "down" });
  });

  it("R. a metric with no canonical direction pre-selects nothing and blocks Save until the owner explicitly chooses", async () => {
    renderPage();
    await resolveDashboard(
      BIZ_A.id,
      dashboardFixture("A", BIZ_A.id, [action({ verificationMetric: "revenue" })])
    );
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    expect(screen.getByLabelText("Target direction")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();
    expect(verifyCalls).toHaveLength(0);
    expect(
      screen.getByText("Select whether higher or lower is the improvement for this metric before saving.")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Target direction"), { target: { value: "down" } });
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();
    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]!.body).toEqual({ beforeValue: null, afterValue: null, targetDirection: "down" });
  });

  it("J. server failure shows a governed owner-safe error, never a raw exception, and leaves the form open", async () => {
    patchBehavior = "fail500";
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();

    // This page's own api() helper collapses any failed response into a plain Error carrying the
    // server's raw "error" string as its message (pre-existing, unchanged by this wave) -- routed
    // through classifyOperatorError, that still yields a governed, generic action-failure message,
    // never the raw "boom" text.
    expect(await screen.findByText("Couldn't process this action. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    // Failure must never clear the open inline form.
    expect(screen.getByText("Complete action")).toBeInTheDocument();
  });

  it("K. successful mutation reloads the current business", async () => {
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();
    // A second dashboard GET for A is the authoritative reload.
    await waitFor(() => expect((dashboardCallsByBiz[BIZ_A.id] ?? []).length).toBeGreaterThan(1));
  });

  it("L. a stale business-switch mutation result does not reload/overwrite the newly-active business", async () => {
    patchBehavior = "pending";
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();
    expect(patchCalls).toHaveLength(1);

    // Switch to B before A's completion PATCH resolves.
    fireEvent.click(screen.getByTestId("switch-to-b"));
    await resolveDashboard(BIZ_B.id, dashboardFixture("B", BIZ_B.id, [action({ id: "b-action" })]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument());

    // A's stale completion now resolves successfully.
    await act(async () => { pendingPatchResolvers[0]!.resolve(ok({ status: "completed" })); });
    await flush();

    // B's dashboard (one GET at mount) must not have been reloaded by A's stale continuation.
    expect((dashboardCallsByBiz[BIZ_A.id] ?? []).length).toBe(1);
    expect((dashboardCallsByBiz[BIZ_B.id] ?? []).length).toBe(1);
  });

  it("M. rapid repeated Save produces exactly one mutation request", async () => {
    patchBehavior = "pending";
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    const saveButton = screen.getByRole("button", { name: "Save completion" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    await flush();

    expect(patchCalls).toHaveLength(1);
  });

  it("N. the page never depends on window.prompt", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    renderPage();
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    await flush();
    // Completion succeeded and triggered the authoritative reload -- resolve it before continuing.
    await resolveDashboard(BIZ_A.id, dashboardFixture("A", BIZ_A.id), 1);
    fireEvent.click(await screen.findByRole("button", { name: "Verify outcome" }));
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await flush();

    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("O. with two action rows, keyboard Cancel on the SECOND row's Verify form returns focus to that row's own trigger (never the first row's, never the page body), and sends no mutation request", async () => {
    // Confirmed production accessibility finding: closing the Verify form left focus on the page
    // body instead of the button that opened it. The fix's own logic lives in the trigger's onClick
    // handler, which runs identically however the click was produced (mouse, or a real browser's
    // native Space/Enter-activates-a-focused-button default action) -- fireEvent.click here proves
    // that handler restores focus correctly; the real keyboard path (Tab to Cancel, press Space) is
    // separately verified against a live rendered app, since jsdom/Testing Library's fireEvent does
    // not reproduce a browser's native keyboard-activation-triggers-click behavior without
    // @testing-library/user-event, which is not a dependency of this repo.
    renderPage();
    await resolveDashboard(
      BIZ_A.id,
      dashboardFixture("A", BIZ_A.id, [
        action({ id: "action-1", title: "First action" }),
        action({ id: "action-2", title: "Second action" }),
      ])
    );

    const verifyTriggers = await screen.findAllByRole("button", { name: "Verify outcome" });
    expect(verifyTriggers).toHaveLength(2);
    const [firstTrigger, secondTrigger] = verifyTriggers;

    // Closed state: no expanded/controls state on either trigger yet.
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger.getAttribute("aria-controls")).toBeNull();

    fireEvent.click(secondTrigger);
    const heading = await screen.findByRole("heading", { name: "Verify outcome" });

    // Only the SECOND row's trigger claims the open state -- the first row's is untouched.
    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(firstTrigger.getAttribute("aria-controls")).toBeNull();

    const controlsId = secondTrigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const formEl = document.getElementById(controlsId!);
    expect(formEl).not.toBeNull();
    expect(formEl).toContainElement(heading);
    // Accessible name: the form's own aria-labelledby resolves to the visible heading text.
    expect(formEl).toHaveAttribute("aria-labelledby", heading.id);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();

    expect(document.activeElement).toBe(secondTrigger);
    expect(document.activeElement).not.toBe(firstTrigger);
    expect(document.activeElement).not.toBe(document.body);
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");
    expect(secondTrigger.getAttribute("aria-controls")).toBeNull();
    expect(verifyCalls).toHaveLength(0);
    expect(patchCalls).toHaveLength(0);
  });

  it("P. with two action rows, keyboard Cancel on the SECOND row's Complete form returns focus to that row's own trigger (never the first row's), and sends no mutation request", async () => {
    renderPage();
    await resolveDashboard(
      BIZ_A.id,
      dashboardFixture("A", BIZ_A.id, [
        action({ id: "action-1", title: "First action" }),
        action({ id: "action-2", title: "Second action" }),
      ])
    );

    const completeTriggers = await screen.findAllByRole("button", { name: "Complete" });
    expect(completeTriggers).toHaveLength(2);
    const [firstTrigger, secondTrigger] = completeTriggers;

    fireEvent.click(secondTrigger);
    const heading = await screen.findByText("Complete action");

    expect(secondTrigger).toHaveAttribute("aria-expanded", "true");
    expect(firstTrigger).toHaveAttribute("aria-expanded", "false");
    expect(firstTrigger.getAttribute("aria-controls")).toBeNull();

    const controlsId = secondTrigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const formEl = document.getElementById(controlsId!);
    expect(formEl).not.toBeNull();
    expect(formEl).toContainElement(heading);
    expect(formEl).toHaveAttribute("aria-labelledby", heading.id);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();

    expect(document.activeElement).toBe(secondTrigger);
    expect(document.activeElement).not.toBe(firstTrigger);
    expect(document.activeElement).not.toBe(document.body);
    expect(patchCalls).toHaveLength(0);
  });
});
