/**
 * Skeleton loading-state family — jsdom component test.
 *
 * Proves the P3 visual-system-closure contract: each layout-shaped skeleton
 * renders a distinct structural shape (not one bespoke, unstructured "Loading…"
 * string), never renders fabricated data (no numbers, names, or other content
 * that could be mistaken for real values), exposes an accessible status role
 * with a caller-controlled label, and the base Skeleton block carries the
 * `motion-reduce:animate-none` class so `prefers-reduced-motion` degrades it
 * to a static placeholder instead of leaving decorative motion running.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  Skeleton,
  CardDashboardSkeleton,
  TableListSkeleton,
  FormSkeleton,
  DetailPageSkeleton,
  MetricSummarySkeleton,
} from "@/ui/primitives/skeleton";

afterEach(() => cleanup());

describe("Skeleton (base block)", () => {
  it("respects prefers-reduced-motion via the motion-reduce:animate-none utility", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("motion-reduce:animate-none");
  });

  it("is hidden from the accessibility tree as a purely decorative placeholder", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CardDashboardSkeleton", () => {
  it("exposes an accessible status role with the caller's label", () => {
    render(<CardDashboardSkeleton label="Loading finance workspace" />);
    expect(screen.getByRole("status", { name: "Loading finance workspace" })).toBeInTheDocument();
  });

  it("renders the requested number of card sections", () => {
    const { container } = render(<CardDashboardSkeleton sections={5} />);
    // one bordered bg-card placeholder per section, plus the title-bar skeleton block
    const cards = container.querySelectorAll(".border-border.bg-card");
    expect(cards.length).toBe(5);
  });

  it("never renders literal numeric or fabricated text content", () => {
    render(<CardDashboardSkeleton label="Loading" sections={2} />);
    const status = screen.getByRole("status");
    // Only the sr-only "Loading…" label text should be present — no digits,
    // dollar signs, or other content that could be mistaken for real data.
    expect(status.textContent?.trim()).toBe("Loading…");
  });
});

describe("TableListSkeleton", () => {
  it("renders a filter-bar placeholder plus the requested row count", () => {
    const { container } = render(<TableListSkeleton rows={4} />);
    const rows = container.querySelectorAll(".divide-y > div");
    expect(rows.length).toBe(4);
  });

  it("exposes an accessible status role", () => {
    render(<TableListSkeleton label="Loading customers" />);
    expect(screen.getByRole("status", { name: "Loading customers" })).toBeInTheDocument();
  });
});

describe("FormSkeleton", () => {
  it("renders one label/input placeholder pair per requested field", () => {
    const { container } = render(<FormSkeleton fields={6} />);
    // each field is a label-skeleton + input-skeleton pair inside its own wrapper
    const fieldWrappers = container.querySelectorAll(":scope > div > div.space-y-1\\.5");
    expect(fieldWrappers.length).toBe(6);
  });
});

describe("DetailPageSkeleton", () => {
  it("renders a title placeholder plus stacked info-block placeholders", () => {
    const { container } = render(<DetailPageSkeleton />);
    const blocks = container.querySelectorAll(".border-border.bg-card");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("MetricSummarySkeleton", () => {
  it("renders the requested number of stat-tile placeholders", () => {
    const { container } = render(<MetricSummarySkeleton tiles={3} />);
    const tiles = container.querySelectorAll(".border-border.bg-card");
    expect(tiles.length).toBe(3);
  });

  it("never renders fabricated metric values as visible text", () => {
    render(<MetricSummarySkeleton label="Loading impact metrics" tiles={2} />);
    const status = screen.getByRole("status");
    expect(status.textContent?.trim()).toBe("Loading impact metrics…");
  });
});
