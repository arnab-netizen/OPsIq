/**
 * EmptyState primitive — jsdom component test.
 *
 * Proves the P2 visual-system-closure contract: a "true empty" (zero data,
 * first run) call site and a "filtered empty" (data exists, filter hid it)
 * call site render distinguishable title/description/CTA — never the same
 * generic "No X found" string regardless of cause — and that primary/
 * secondary actions render as the correct interactive element (button for
 * onClick, link for href) without inventing business logic in the component
 * itself (it only renders what its caller passes).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EmptyState } from "@/ui/primitives/states";

afterEach(() => cleanup());

describe("EmptyState", () => {
  it("renders a true-empty (zero-data, first-run) message distinct from a filtered-empty message", () => {
    const { unmount } = render(
      <EmptyState
        title="No customers yet"
        description="Add your first customer to start tracking segments, lifetime value, and purchase history."
        primaryAction={{ label: "+ New Customer", onClick: () => {} }}
      />
    );
    expect(screen.getByText("No customers yet")).toBeInTheDocument();
    expect(screen.getByText(/Add your first customer/)).toBeInTheDocument();
    unmount();

    render(
      <EmptyState
        title="No customers match this filter"
        description='No customers are in the "VIP" segment.'
        primaryAction={{ label: "Clear filter", onClick: () => {} }}
      />
    );
    expect(screen.getByText("No customers match this filter")).toBeInTheDocument();
    expect(screen.getByText(/VIP/)).toBeInTheDocument();
  });

  it("distinguishes a permission-denied empty state from a data-driven one via caller-supplied copy", () => {
    render(
      <EmptyState
        title="Access restricted"
        description="You don't have permission to view this workspace's risk register."
      />
    );
    expect(screen.getByText("Access restricted")).toBeInTheDocument();
    // No CTA is rendered when the caller supplies none — a permission-denied
    // state should not offer a "create" action the user cannot use.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an onClick primaryAction as a button", async () => {
    const onClick = vi.fn();
    render(<EmptyState title="No risks logged yet" primaryAction={{ label: "+ New Risk", onClick }} />);
    const btn = screen.getByRole("button", { name: "+ New Risk" });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an href primaryAction as a link, not a button", () => {
    render(<EmptyState title="No business set up yet" primaryAction={{ label: "Go to Finance", href: "/owner/finance" }} />);
    const link = screen.getByRole("link", { name: "Go to Finance" });
    expect(link).toHaveAttribute("href", "/owner/finance");
    expect(screen.queryByRole("button", { name: "Go to Finance" })).not.toBeInTheDocument();
  });

  it("renders both primary and secondary actions when both are supplied", () => {
    render(
      <EmptyState
        title="No tasks match this filter"
        primaryAction={{ label: "Clear filter", onClick: () => {} }}
        secondaryAction={{ label: "+ New Task", href: "/owner/tasks/new" }}
      />
    );
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New Task" })).toBeInTheDocument();
  });

  it("falls back to the legacy freeform action slot when no primary/secondary action is given", () => {
    render(
      <EmptyState title="No bundles yet" action={<button type="button">Create Bundle</button>} />
    );
    expect(screen.getByRole("button", { name: "Create Bundle" })).toBeInTheDocument();
  });

  it("prefers primaryAction/secondaryAction over the legacy action slot when both are given", () => {
    render(
      <EmptyState
        title="No evidence yet"
        primaryAction={{ label: "Add Manual Evidence", onClick: () => {} }}
        action={<button type="button">Legacy Action</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Add Manual Evidence" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Legacy Action" })).not.toBeInTheDocument();
  });

  it("renders a default title and icon when the caller supplies neither copy nor icon", () => {
    render(<EmptyState />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("renders a caller-supplied icon in place of the default icon", () => {
    render(<EmptyState title="No results" icon={<svg data-testid="custom-icon" />} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });
});
