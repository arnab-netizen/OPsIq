/**
 * /owner/tasks/new — real page + real DOM, mocked fetch/router. Non-DB.
 *
 * ROOT CAUSE this closes: the Tasks page's "+ New Task" CTA always linked to /owner/tasks/new, but
 * no page existed there — Next's [taskId] dynamic sibling matched "new" instead and crashed with a
 * raw Prisma error calling GET /api/owner/tasks/new. This proves the intended page now exists,
 * reuses the existing POST /api/owner/tasks endpoint (no second creation API), requires a title,
 * has double-submit protection, shows only governed error text, and navigates to the real task
 * detail page on success.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewOwnerTaskPage from "@/app/(authenticated)/owner/tasks/new/page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("NewOwnerTaskPage", () => {
  it("renders a title field, calls it never calls GET /api/owner/tasks/new", () => {
    render(<NewOwnerTaskPage />);
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not submit with an empty title (required-field guard)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ taskId: "t1" }) });
    render(<NewOwnerTaskPage />);
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("submits POST /api/owner/tasks (never GET /api/owner/tasks/new) and navigates to the created task on success", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ taskId: "11111111-1111-4111-8111-111111111111" }) });
    render(<NewOwnerTaskPage />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Call overdue customers" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/owner/tasks");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.title).toBe("Call overdue customers");
    expect(body).not.toHaveProperty("id"); // no client-supplied task id

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/owner/tasks/11111111-1111-4111-8111-111111111111"));
  });

  it("includes assignedRole and requireProof only when the owner opts in", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ taskId: "t1" }) });
    render(<NewOwnerTaskPage />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Follow up" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("assignedRole");
    expect(body).not.toHaveProperty("requireProof");
  });

  it("shows only a governed error message on failure, never the raw server error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "PrismaClientKnownRequestError: P2007" }) });
    render(<NewOwnerTaskPage />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Follow up" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/Prisma|P2007/);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("double-submit protection: a second rapid click while submitting does not send a second request", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<NewOwnerTaskPage />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Follow up" } });
    const submitButton = screen.getByRole("button", { name: "Create task" });
    fireEvent.click(submitButton);
    await waitFor(() => expect(screen.getByRole("button", { name: "Creating…" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Creating…" }));
    resolveFetch({ ok: true, json: async () => ({ taskId: "t1" }) });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  it("Cancel navigates back to the task list without submitting", () => {
    render(<NewOwnerTaskPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockPush).toHaveBeenCalledWith("/owner/tasks");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
