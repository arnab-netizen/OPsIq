/**
 * Decision inbox empty-state contract (residual 4 of the PR #385 closure pass).
 *
 * `InboxClient` (dashboard/inbox) and `DecisionInboxTable` (embedded decisions
 * widget) previously rendered a bare "No decisions found" regardless of
 * whether the inbox has zero decisions ever (true-empty) or the current
 * status filter just returns nothing (filtered-empty). Both now route through
 * the shared `EmptyState` primitive with distinct copy and, for the filtered
 * case, a real "Clear filter" action wired to the component's own filter-reset
 * state — the same true/filtered distinction pattern PR #385 already applied
 * to owner/customers, owner/risks, owner/vendor, and owner/tasks.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InboxClient (dashboard/inbox) — true-empty vs filtered-empty", () => {
  it("renders a true-empty message with no filter-clearing CTA when there is no status filter and zero decisions", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useSearchParams: () => new URLSearchParams(""),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ decisions: [], total: 0, limit: 20, offset: 0 }),
      })
    );
    const { InboxClient } = await import("@/app/(authenticated)/dashboard/inbox/inbox-client");
    render(<InboxClient workspaceId="ws-1" />);

    await waitFor(() => expect(screen.getByText("No decisions yet")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /clear filter/i })).not.toBeInTheDocument();
  });

  it("renders a filtered-empty message with a working Clear filter action when a status filter yields zero decisions", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useSearchParams: () => new URLSearchParams("status=blocked"),
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ decisions: [], total: 0, limit: 20, offset: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { InboxClient } = await import("@/app/(authenticated)/dashboard/inbox/inbox-client");
    render(<InboxClient workspaceId="ws-1" />);

    await waitFor(() => expect(screen.getByText("No decisions match this filter")).toBeInTheDocument());
    const clearBtn = screen.getByRole("button", { name: /clear filter/i });
    expect(clearBtn).toBeInTheDocument();

    // The initial fetch used the status=blocked filter.
    expect(fetchMock.mock.calls[0][0]).toContain("status=blocked");

    fireEvent.click(clearBtn);
    // Clearing the filter triggers a refetch without the status param.
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain("status=");
    });
  });
});

describe("DecisionInboxTable (embedded decisions widget) — true-empty reachable, filtered-empty wired", () => {
  it("renders a true-empty message (the only state reachable while its fetch stub returns no items)", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
    const { DecisionInboxTable } = await import("@/components/decisions/DecisionInboxTable");
    render(<DecisionInboxTable />);

    await waitFor(() => expect(screen.getByText("No decisions yet")).toBeInTheDocument());
  });

  it("source: the filtered-empty branch renders distinct copy with a Clear filter action wired to setFilter(\"all\")", () => {
    // DecisionInboxTable's own fetch always resolves to an empty decisions
    // array (a pre-existing, out-of-scope stub — see the component's own
    // comment), so `decisions.length > 0 && filtered.length === 0` is not
    // reachable through its current fetch wiring and can't be driven through
    // a real render. The branch is proven at the source level instead.
    const source = read("src/components/decisions/DecisionInboxTable.tsx");
    expect(source).toMatch(/title="No decisions match this filter"/);
    expect(source).toMatch(/label:\s*"Clear filter",\s*onClick:\s*\(\)\s*=>\s*setFilter\("all"\)/);
  });
});

describe("Table primitive's emptyState prop (residual 5)", () => {
  it("existing callers that only pass emptyMessage keep the plain bare-text row unchanged", async () => {
    const { Table } = await import("@/ui/primitives/table");
    render(
      <Table
        columns={[{ key: "name", header: "Name", render: (r: { name: string }) => r.name }]}
        data={[]}
        keyExtractor={(r: { name: string }) => r.name}
        emptyMessage="No users found"
      />
    );
    expect(screen.getByText("No users found")).toBeInTheDocument();
  });

  it("renders a caller-supplied emptyState node in place of the default bare-text row when provided", async () => {
    const { Table } = await import("@/ui/primitives/table");
    const { EmptyState } = await import("@/ui/primitives/states");
    render(
      <Table
        columns={[{ key: "name", header: "Name", render: (r: { name: string }) => r.name }]}
        data={[]}
        keyExtractor={(r: { name: string }) => r.name}
        emptyState={<EmptyState title="No users yet" description="Users appear here once added." />}
      />
    );
    expect(screen.getByText("No users yet")).toBeInTheDocument();
    expect(screen.queryByText("No data available")).not.toBeInTheDocument();
  });

  it("still renders rows normally when data is non-empty, regardless of emptyState being supplied", async () => {
    const { Table } = await import("@/ui/primitives/table");
    render(
      <Table
        columns={[{ key: "name", header: "Name", render: (r: { name: string }) => r.name }]}
        data={[{ name: "Ada" }]}
        keyExtractor={(r: { name: string }) => r.name}
        emptyState={<div>should not render</div>}
      />
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
  });
});
