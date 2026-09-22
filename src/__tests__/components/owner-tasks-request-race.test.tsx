/**
 * Owner Tasks (/owner/tasks) — delegated-list stale filter/pagination-request race (UX-05C,
 * Candidate 5 from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md Section AC).
 *
 * ROOT CAUSE: `load(status, off)` in owner/tasks/page.tsx had no request-generation guard. An
 * older filter or pagination request resolving AFTER a newer one could silently overwrite the
 * newer, correct result with stale data -- the fix is a plain latest-request-wins guard (no
 * business-context mechanism is involved here, unlike Candidate 1: this loader has no per-business
 * intent to track, only "is this response still the most recently requested one?").
 *
 * FIX: `load()` now stamps a monotonically increasing generation number (a ref, not state) at the
 * start of each call, and every state commit (`setTasks`, the catch's `setError`, and the
 * `finally`'s `setLoading(false)`) is guarded by "is this still the latest generation?" before
 * applying -- mirroring the same `loadGenerationRef` pattern already proven on Home/Money/Sales/
 * Operations/Execution.
 *
 * UI CONSTRAINT NOTE (pagination race, below): the Previous/Next buttons only render while
 * `!loading`, so a genuine second "Next" click cannot be fired via real UI interaction before the
 * first pagination request resolves -- the button simply doesn't exist yet. The pagination race
 * test below therefore uses the filter <select> (which stays live during a pending load, unlike
 * the pagination buttons) to produce the second, newer, overlapping request while an older
 * Next-triggered request is still pending. This exercises the exact same shared
 * `loadGenerationRef` guard that protects pure pagination sequences, with the "older" request
 * genuinely originating from a real "Next" click.
 *
 * The separate "My Work" (ProcessExecutionTask) loader has its own effect-local `cancelled` guard
 * and is untouched by this mission; its request is allowed to resolve normally in every test below
 * so it never obscures the delegated-task assertions.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent, act } from "@testing-library/react";
import OwnerTasksPage from "@/app/(authenticated)/owner/tasks/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function makeTask(id: string, title: string, status = "ASSIGNED") {
  return {
    id,
    title,
    status,
    priority: null,
    assignedUserId: null,
    assignedRole: null,
    dueAt: null,
    createdAt: new Date().toISOString(),
    proofRequirementId: null,
  };
}

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerTasksPage />
    </ActiveBusinessProvider>
  );
}

interface PendingTaskCall {
  status: string;
  offset: number;
  resolve: (data: unknown) => void;
  reject: (err: unknown) => void;
}
let taskCalls: PendingTaskCall[];

function installFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return ok({ businesses: [BIZ_A] });
      }
      // "My Work" -- allowed to resolve normally so it never obscures delegated-task assertions.
      if (url.includes("/api/owner/process-execution")) {
        return ok({ tasks: [] });
      }
      if (url.includes("/api/owner/tasks?")) {
        const params = new URL(url, "https://example.com").searchParams;
        const status = params.get("status") ?? "";
        const offset = Number(params.get("offset") ?? "0");
        return new Promise<Response>((resolve, reject) => {
          taskCalls.push({ status, offset, resolve: (data) => resolve(ok(data)), reject });
        });
      }
      return ok({});
    })
  );
}

/** Flush the microtask queue enough times for a resolved/rejected fetch promise to propagate
 *  through the subsequent `setState` calls inside `load()`. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function waitForTaskCall(
  matcher: { status?: string; offset?: number },
  occurrence = 0
): Promise<PendingTaskCall> {
  await waitFor(
    () => {
      const matches = taskCalls.filter(
        (c) =>
          (matcher.status === undefined || c.status === matcher.status) &&
          (matcher.offset === undefined || c.offset === matcher.offset)
      );
      expect(matches.length).toBeGreaterThan(occurrence);
    },
    { timeout: 3000 }
  );
  return taskCalls.filter(
    (c) =>
      (matcher.status === undefined || c.status === matcher.status) &&
      (matcher.offset === undefined || c.offset === matcher.offset)
  )[occurrence]!;
}

function selectFilter(status: string) {
  fireEvent.change(screen.getByLabelText("Filter tasks by status"), { target: { value: status } });
}

beforeEach(() => {
  taskCalls = [];
  installFetchMock();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Owner Tasks — delegated-list stale filter/pagination-request race (UX-05C Candidate 5)", () => {
  it("filter race: a stale filter-A response resolving after a newer filter-B response must never overwrite it", async () => {
    renderPage();
    const initial = await waitForTaskCall({ status: "", offset: 0 });
    await act(async () => { initial.resolve({ tasks: [] }); });
    await flush();

    selectFilter("IN_PROGRESS");
    const callA = await waitForTaskCall({ status: "IN_PROGRESS", offset: 0 });

    selectFilter("BLOCKED");
    const callB = await waitForTaskCall({ status: "BLOCKED", offset: 0 });

    // B (the newer, current filter) resolves first.
    await act(async () => { callB.resolve({ tasks: [makeTask("t-b", "B-ONLY-TASK", "BLOCKED")] }); });
    await flush();
    await waitFor(() => expect(screen.getByText("B-ONLY-TASK")).toBeInTheDocument());

    // The stale A response finally arrives.
    await act(async () => { callA.resolve({ tasks: [makeTask("t-a", "A-ONLY-TASK", "IN_PROGRESS")] }); });
    await flush();

    expect(screen.getByText("B-ONLY-TASK")).toBeInTheDocument();
    expect(screen.queryByText("A-ONLY-TASK")).not.toBeInTheDocument();
  });

  it("pagination race: an older Next-triggered request resolving after a newer (filter-triggered) request must not un-advance the view", async () => {
    renderPage();
    const initial = await waitForTaskCall({ status: "", offset: 0 });
    // Exactly LIMIT (25) tasks so the real "Next" button appears.
    const page0Tasks = Array.from({ length: 25 }, (_, i) => makeTask(`p0-${i}`, `PAGE0-TASK-${i}`));
    await act(async () => { initial.resolve({ tasks: page0Tasks }); });
    await flush();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument());

    // Click Next -- a genuine, real pagination request for offset 25. Left pending (older).
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const olderPageCall = await waitForTaskCall({ offset: 25 });

    // The Previous/Next buttons are now hidden while this request is in flight (loading), but the
    // filter select stays live -- use it to produce the second, newer, overlapping request. See
    // this file's header comment for why this is the real-UI-achievable form of the race.
    selectFilter("IN_PROGRESS");
    const newerCall = await waitForTaskCall({ status: "IN_PROGRESS", offset: 0 });

    // Newer resolves first.
    await act(async () => { newerCall.resolve({ tasks: [makeTask("t-new", "FILTERED-NEWER-TASK", "IN_PROGRESS")] }); });
    await flush();
    await waitFor(() => expect(screen.getByText("FILTERED-NEWER-TASK")).toBeInTheDocument());

    // The older, now-stale offset-25 pagination response resolves afterward.
    await act(async () => { olderPageCall.resolve({ tasks: [makeTask("t-old", "PAGE25-OLDER-TASK")] }); });
    await flush();

    expect(screen.getByText("FILTERED-NEWER-TASK")).toBeInTheDocument();
    expect(screen.queryByText("PAGE25-OLDER-TASK")).not.toBeInTheDocument();
    expect(screen.queryByText(/PAGE0-TASK-/)).not.toBeInTheDocument();
  });

  it("stale failure: an older filter request that fails after a newer one already succeeded must not replace the newer result with an error banner", async () => {
    renderPage();
    const initial = await waitForTaskCall({ status: "", offset: 0 });
    await act(async () => { initial.resolve({ tasks: [] }); });
    await flush();

    selectFilter("IN_PROGRESS");
    const callA = await waitForTaskCall({ status: "IN_PROGRESS", offset: 0 });

    selectFilter("BLOCKED");
    const callB = await waitForTaskCall({ status: "BLOCKED", offset: 0 });

    await act(async () => { callB.resolve({ tasks: [makeTask("t-b", "B-ONLY-TASK", "BLOCKED")] }); });
    await flush();
    await waitFor(() => expect(screen.getByText("B-ONLY-TASK")).toBeInTheDocument());

    // The stale A request fails afterward.
    await act(async () => { callA.reject(new Error("Request timed out")); });
    await flush();

    expect(screen.getByText("B-ONLY-TASK")).toBeInTheDocument();
    expect(document.querySelector(".text-destructive")).toBeNull();
  });

  it("stale loading completion: an older request's finally() must not clear the loading flag while a newer request is still pending", async () => {
    renderPage();
    const initial = await waitForTaskCall({ status: "", offset: 0 });
    await act(async () => { initial.resolve({ tasks: [] }); });
    await flush();

    selectFilter("IN_PROGRESS");
    const callA = await waitForTaskCall({ status: "IN_PROGRESS", offset: 0 });

    selectFilter("BLOCKED");
    const callB = await waitForTaskCall({ status: "BLOCKED", offset: 0 });

    // The older (A) request finishes first -- its own finally() must not surface as "done" for
    // the still-pending, newer (B) generation. Neither A's nor B's data may render yet, AND the
    // real loading skeleton must still be showing -- a stale setLoading(false) here would let a
    // false "No tasks match this filter" empty state render while B is still authoritative and
    // pending, which the earlier "A-ONLY-TASK absent" assertion alone could not catch (that
    // assertion only proves setTasks() is guarded, not that setLoading(false) is).
    await act(async () => { callA.resolve({ tasks: [makeTask("t-a", "A-ONLY-TASK", "IN_PROGRESS")] }); });
    await flush();
    expect(screen.queryByText("A-ONLY-TASK")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("No tasks match this filter")).not.toBeInTheDocument();

    // B (the newer, authoritative generation) now resolves.
    await act(async () => { callB.resolve({ tasks: [makeTask("t-b", "B-ONLY-TASK", "BLOCKED")] }); });
    await flush();
    await waitFor(() => expect(screen.getByText("B-ONLY-TASK")).toBeInTheDocument());
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
    expect(screen.queryByText("A-ONLY-TASK")).not.toBeInTheDocument();
  });
});
