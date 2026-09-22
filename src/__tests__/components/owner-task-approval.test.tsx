/**
 * UX-06 Wave A2 (Section T.2, Candidate 9) — same-page final task approval,
 * behavioral proof. Renders the real Task Detail component with mocked `fetch`;
 * the approval handler itself is never mocked away.
 *
 * Covers exactly the frozen future test contract from the UX-06 doc: the button
 * calls the existing, unchanged POST /api/owner/tasks/complete with only
 * { taskId }, structured 409 blocked-reasons map to plain owner language and never
 * leak the raw code, an unexpected failure stays operator-safe via the existing
 * classifyOperatorError path, a successful approval reloads the authoritative task
 * state rather than optimistically mutating it client-side, and a rapid double
 * click issues exactly one completion request.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import TaskDetailPage from "@/app/(authenticated)/owner/tasks/[taskId]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ taskId: "11111111-1111-4111-8111-111111111111" }),
}));

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    title: "Follow up with overdue accounts",
    description: null,
    status: "COMPLETED_PENDING_REVIEW",
    priority: null,
    assignedUserId: null,
    assignedRole: null,
    dueAt: null,
    workStartedAt: null,
    createdAt: new Date().toISOString(),
    proofRequirementId: null,
    sourceOperatorItemId: null,
    proof: null,
    proofRequirement: null,
    statusHistory: [],
    ...overrides,
  };
}

function parsedBody(init?: RequestInit): unknown {
  return JSON.parse((init?.body as string) ?? "{}");
}

function contentType(init?: RequestInit): string | null {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["Content-Type"] ?? null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UX-06 Wave A2 — Approve task: success flow", () => {
  it("POSTs { taskId } only to /api/owner/tasks/complete, then reloads to Approved", async () => {
    let getCount = 0;
    const postCalls: Array<{ url: string; method: string; contentType: string | null; body: unknown }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url === `/api/owner/tasks/${TASK_ID}`) {
          getCount += 1;
          const status = getCount === 1 ? "COMPLETED_PENDING_REVIEW" : "APPROVED_COMPLETE";
          return { ok: true, status: 200, json: async () => ({ task: baseTask({ status }) }) } as Response;
        }
        if (method === "POST" && url === "/api/owner/tasks/complete") {
          postCalls.push({ url, method, contentType: contentType(init), body: parsedBody(init) });
          return { ok: true, status: 200, json: async () => ({ status: "APPROVED_COMPLETE" }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    render(<TaskDetailPage />);
    const approveButton = await screen.findByRole("button", { name: "Approve task" });
    fireEvent.click(approveButton);

    await screen.findByText("Task approved.");
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(screen.queryByText("Ready for approval")).not.toBeInTheDocument();

    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].url).toBe("/api/owner/tasks/complete");
    expect(postCalls[0].method).toBe("POST");
    expect(postCalls[0].contentType).toBe("application/json");
    expect(postCalls[0].body).toEqual({ taskId: TASK_ID });
    expect(postCalls[0].body).not.toHaveProperty("ownerOverride");
    expect(postCalls[0].body).not.toHaveProperty("maxProofAgeDays");
    expect(getCount).toBe(2);
  });
});

describe("UX-06 Wave A2 — Approve task: loading state and duplicate-submit guard", () => {
  it("disables the button while in flight and issues exactly one POST for two rapid clicks", async () => {
    let postCallCount = 0;
    let getCount = 0;
    let resolvePost: ((value: Response) => void) | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url === `/api/owner/tasks/${TASK_ID}`) {
          getCount += 1;
          const status = getCount === 1 ? "COMPLETED_PENDING_REVIEW" : "APPROVED_COMPLETE";
          return { ok: true, status: 200, json: async () => ({ task: baseTask({ status }) }) } as Response;
        }
        if (method === "POST" && url === "/api/owner/tasks/complete") {
          postCallCount += 1;
          return new Promise<Response>((resolve) => {
            resolvePost = resolve;
          });
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    render(<TaskDetailPage />);
    const approveButton = await screen.findByRole("button", { name: "Approve task" });

    // Two synchronous clicks in the same tick -- exactly the race the ref guard
    // (not React state, which only updates on the next render) must prevent.
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    const approvingButton = await screen.findByRole("button", { name: "Approving…" });
    expect(approvingButton).toBeDisabled();
    expect(postCallCount).toBe(1);

    resolvePost!({ ok: true, status: 200, json: async () => ({ status: "APPROVED_COMPLETE" }) } as Response);
    await screen.findByText("Task approved.");
    expect(postCallCount).toBe(1);
  });
});

describe("UX-06 Wave A2 — Approve task: known blocked reasons map to owner language", () => {
  const CASES: Array<[string, string]> = [
    ["proof_not_accepted", "The proof still needs to be accepted before this task can be approved."],
    [
      "duplicate_proof",
      "This proof was flagged as a duplicate. Review it or ask for new proof before approving the task.",
    ],
    ["proof_stale", "The accepted proof is too old to use for approval. Ask for updated proof."],
    [
      "separation_of_duty",
      "The person who completed this work cannot approve it. Another authorised reviewer needs to approve the task.",
    ],
    [
      "transition_denied",
      "This task cannot be approved from its current state. Refresh the task and review its latest status.",
    ],
  ];

  it.each(CASES)(
    "reason %s renders its frozen owner-facing message, never the raw code, and does not reload",
    async (reason, expectedMessage) => {
      let getCount = 0;
      let postCount = 0;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = (init?.method ?? "GET").toUpperCase();
          if (method === "GET" && url === `/api/owner/tasks/${TASK_ID}`) {
            getCount += 1;
            return { ok: true, status: 200, json: async () => ({ task: baseTask({ status: "COMPLETED_PENDING_REVIEW" }) }) } as Response;
          }
          if (method === "POST" && url === "/api/owner/tasks/complete") {
            postCount += 1;
            return { ok: false, status: 409, json: async () => ({ blocked: true, reason }) } as Response;
          }
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        })
      );

      render(<TaskDetailPage />);
      const approveButton = await screen.findByRole("button", { name: "Approve task" });
      fireEvent.click(approveButton);

      expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
      expect(screen.queryByText("Task approved.")).not.toBeInTheDocument();
      expect(postCount).toBe(1);
      expect(getCount).toBe(1); // no reload GET after a blocked completion

      expect(screen.getByRole("button", { name: "Approve task" })).not.toBeDisabled();
    }
  );
});

describe("UX-06 Wave A2 — Approve task: unknown 409 reason never leaks", () => {
  it("an unrecognized reason renders only the existing governed action message, never the raw code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url === `/api/owner/tasks/${TASK_ID}`) {
          return { ok: true, status: 200, json: async () => ({ task: baseTask({ status: "COMPLETED_PENDING_REVIEW" }) }) } as Response;
        }
        if (method === "POST" && url === "/api/owner/tasks/complete") {
          return { ok: false, status: 409, json: async () => ({ blocked: true, reason: "FUTURE_INTERNAL_REASON" }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    render(<TaskDetailPage />);
    const approveButton = await screen.findByRole("button", { name: "Approve task" });
    fireEvent.click(approveButton);

    expect(await screen.findByText("Couldn't process this action. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("FUTURE_INTERNAL_REASON")).not.toBeInTheDocument();
    expect(screen.queryByText("Task approved.")).not.toBeInTheDocument();
  });
});

describe("UX-06 Wave A2 — Approve task: unexpected server failure stays operator-safe", () => {
  it("a 500 with unsafe raw body text never renders that text, only the governed server-error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "GET" && url === `/api/owner/tasks/${TASK_ID}`) {
          return { ok: true, status: 200, json: async () => ({ task: baseTask({ status: "COMPLETED_PENDING_REVIEW" }) }) } as Response;
        }
        if (method === "POST" && url === "/api/owner/tasks/complete") {
          // Test-only unsafe fixture text -- never expected to render to an owner.
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "PrismaClientKnownRequestError: P2002" }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      })
    );

    render(<TaskDetailPage />);
    const approveButton = await screen.findByRole("button", { name: "Approve task" });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(screen.getByText("Server is having trouble. We're working on it.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/PrismaClientKnownRequestError/)).not.toBeInTheDocument();
    expect(screen.queryByText("Task approved.")).not.toBeInTheDocument();
  });
});
