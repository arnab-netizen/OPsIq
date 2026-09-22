/**
 * /owner/tasks — presentation-only regression proof (UX-05B, cosmetic scope only).
 *
 * Covers exactly two authorized candidates from docs/opsiq/ux/UX-05A-ACTIONS-LAYER-CONTRACT.md:
 *  - Candidate 4: the "Done" list-row badge previously rendered the identical green "Done" text
 *    for APPROVED_COMPLETE, REJECTED_INCOMPLETE, CANCELLED, and EXPIRED alike. It must now show
 *    each row's own specific outcome (variant AND text), matching the detail page's own
 *    STATUS_VARIANT/STATUS_LABELS. STATUS_GROUPS, the filter optgroup, and pagination are untouched.
 *  - Candidate 6: OWNER_WORK_STATUS_LABELS was missing CANCELLED and would have rendered the raw
 *    uppercase token for a "My work" (ProcessExecutionTask) row.
 *
 * No stale-request race guard (Candidate 5) is implemented or tested here -- that remains a
 * separate, functional-correctness change requiring its own authorization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import OwnerTasksPage from "@/app/(authenticated)/owner/tasks/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

const BIZ_A = { id: "biz-a", name: "Trinity Services", currency: "USD" };

function makeTask(id: string, status: string, assignedRole: string | null = "MANAGER") {
  return {
    id,
    title: `Task ${id}`,
    status,
    priority: null,
    assignedUserId: null,
    assignedRole,
    dueAt: null,
    createdAt: new Date().toISOString(),
    proofRequirementId: null,
  };
}

function installTasksFetchMock(tasks: unknown[], ownerWork: unknown[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/owner/businesses")) {
        return { ok: true, status: 200, json: async () => ({ businesses: [BIZ_A] }) } as Response;
      }
      if (url.includes("/api/owner/process-execution")) {
        return { ok: true, status: 200, json: async () => ({ tasks: ownerWork }) } as Response;
      }
      if (url.includes("/api/owner/tasks")) {
        return { ok: true, status: 200, json: async () => ({ tasks, count: tasks.length }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function getTaskRow(title: string) {
  const link = screen.getByRole("link", { name: title });
  const row = link.closest("li");
  if (!row) throw new Error(`row for "${title}" not found`);
  return row as HTMLElement;
}

describe("Candidate 4 — /owner/tasks 'Done' row badge shows the real outcome", () => {
  it("APPROVED_COMPLETE renders 'Approved' in the success variant", async () => {
    installTasksFetchMock([makeTask("t1", "APPROVED_COMPLETE")]);
    renderWithProvider(<OwnerTasksPage />);
    await screen.findByRole("link", { name: "Task t1" });
    const row = getTaskRow("Task t1");
    expect(within(row).getByText("Approved")).toBeInTheDocument();
    expect(within(row).queryByText("Done")).not.toBeInTheDocument();
  });

  it("REJECTED_INCOMPLETE, CANCELLED, and EXPIRED each render their own distinct text, never the shared word 'Done'", async () => {
    installTasksFetchMock([
      makeTask("t1", "REJECTED_INCOMPLETE"),
      makeTask("t2", "CANCELLED"),
      makeTask("t3", "EXPIRED"),
    ]);
    renderWithProvider(<OwnerTasksPage />);
    await screen.findByRole("link", { name: "Task t1" });

    const row1 = getTaskRow("Task t1");
    const row2 = getTaskRow("Task t2");
    const row3 = getTaskRow("Task t3");
    expect(within(row1).getByText("Rejected")).toBeInTheDocument();
    expect(within(row2).getByText("Cancelled")).toBeInTheDocument();
    expect(within(row3).getByText("Expired")).toBeInTheDocument();
    expect(within(row1).queryByText("Done")).not.toBeInTheDocument();
    expect(within(row2).queryByText("Done")).not.toBeInTheDocument();
    expect(within(row3).queryByText("Done")).not.toBeInTheDocument();
  });

  it("a non-terminal status (e.g. IN_PROGRESS) still renders its bucket name, unaffected by the Done fix", async () => {
    installTasksFetchMock([makeTask("t1", "IN_PROGRESS")]);
    renderWithProvider(<OwnerTasksPage />);
    await screen.findByRole("link", { name: "Task t1" });
    const row = getTaskRow("Task t1");
    expect(within(row).getByText("In progress")).toBeInTheDocument();
  });

  it("the status filter dropdown still lists the raw statuses under the unchanged 'Done' optgroup", async () => {
    installTasksFetchMock([makeTask("t1", "APPROVED_COMPLETE")]);
    renderWithProvider(<OwnerTasksPage />);
    await screen.findByText("Approved");
    const select = screen.getByLabelText("Filter tasks by status");
    const doneGroup = within(select).getByRole("group", { name: "Done" });
    expect(within(doneGroup).getByRole("option", { name: "Cancelled" })).toBeInTheDocument();
    expect(within(doneGroup).getByRole("option", { name: "Expired" })).toBeInTheDocument();
  });
});

describe("Candidate 6 — /owner/tasks 'My work' CANCELLED label", () => {
  it("renders 'Cancelled', never the raw uppercase 'CANCELLED' token", async () => {
    installTasksFetchMock(
      [],
      [
        {
          id: "ow1",
          taskKey: "cp:biz-a:SOME_FINDING",
          businessId: null,
          ownerVisibleSummary: "Some governed action",
          status: "CANCELLED",
          severity: "medium",
          executionRoute: "OWNER_APPROVAL_REQUIRED",
          workStartedAt: null,
        },
      ]
    );
    renderWithProvider(<OwnerTasksPage />);

    const myWorkHeading = await screen.findByText("My work");
    const myWorkSection = myWorkHeading.closest("div") as HTMLElement;
    expect(within(myWorkSection).getByText("Cancelled")).toBeInTheDocument();
    expect(within(myWorkSection).queryByText("CANCELLED")).not.toBeInTheDocument();
  });
});

// UX-06A1 hostile-audit remediation: the "Who:" line previously rendered
// assignedRole raw ("MANAGER", "STAFF"). It must render the humanized label.
describe("UX-06A1 — /owner/tasks 'Who:' line humanizes assignedRole", () => {
  it("assignedRole 'MANAGER' renders 'Who: Manager', never the raw token", async () => {
    installTasksFetchMock([makeTask("t1", "ASSIGNED", "MANAGER")]);
    renderWithProvider(<OwnerTasksPage />);
    const row = await screen.findByRole("link", { name: "Task t1" }).then((link) => link.closest("li") as HTMLElement);

    expect(within(row).getByText("Who: Manager")).toBeInTheDocument();
    expect(within(row).queryByText("Who: MANAGER")).not.toBeInTheDocument();
  });

  it("assignedRole 'STAFF' renders 'Who: Staff', never the raw token", async () => {
    installTasksFetchMock([makeTask("t1", "ASSIGNED", "STAFF")]);
    renderWithProvider(<OwnerTasksPage />);
    const row = await screen.findByRole("link", { name: "Task t1" }).then((link) => link.closest("li") as HTMLElement);

    expect(within(row).getByText("Who: Staff")).toBeInTheDocument();
    expect(within(row).queryByText("Who: STAFF")).not.toBeInTheDocument();
  });
});
