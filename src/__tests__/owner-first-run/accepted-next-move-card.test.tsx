// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const api = vi.hoisted(() => ({ nextMove: vi.fn() }));
vi.mock("@/lib/owner-first-run-client", () => ({ firstRunApi: api }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { AcceptedNextMoveCard } from "@/components/owner/first-run/AcceptedNextMoveCard";
import { deriveNextMove } from "@/domain/owner-first-run/next-move";

afterEach(() => cleanup());
const facts = { commitment: "Collect money customers owe you", decidedAt: new Date("2026-10-01T09:00:00Z"), intendedCompletionAt: null, observationWindowDays: 14, assessed: false, evidenceChangedSince: true, now: new Date("2026-10-05T09:00:00Z") };

describe("AcceptedNextMoveCard", () => {
  it("CURRENT: shown as 'Your next move'", async () => {
    api.nextMove.mockResolvedValue({ nextMove: deriveNextMove({ ...facts, evidenceChangedSince: false, validity: "CURRENT" }) });
    render(<AcceptedNextMoveCard businessId="b1" />);
    await waitFor(() => expect(screen.getByTestId("accepted-next-move")).toBeTruthy());
    expect(screen.getByText("Your next move")).toBeTruthy();
    expect(screen.getByTestId("accepted-next-move").getAttribute("data-validity")).toBe("CURRENT");
  });
  it.each(["SUPERSEDED", "STALE", "NEEDS_REASSESSMENT"] as const)("%s: never presented under 'Your next move'; the earlier action is history with a reason", async (validity) => {
    api.nextMove.mockResolvedValue({ nextMove: deriveNextMove({ ...facts, validity }) });
    render(<AcceptedNextMoveCard businessId="b1" />);
    await waitFor(() => expect(screen.getByTestId("accepted-next-move")).toBeTruthy());
    expect(screen.queryByText("Your next move")).toBeNull();
    expect(screen.getByTestId("accepted-next-move").getAttribute("data-validity")).toBe(validity);
    expect(screen.getByTestId("accepted-next-move-validity-heading").textContent).toMatch(/Earlier action/);
    expect(screen.getByTestId("accepted-next-move-validity-note").textContent).toBeTruthy();
    expect(screen.getByTestId("accepted-next-move-earlier-commitment").textContent).toBe("Collect money customers owe you");
    expect(screen.queryByTestId("accepted-next-move-prompt")).toBeNull();
    expect(screen.getByTestId("accepted-next-move-link").getAttribute("href")).toBe("/owner/first-run");
  });
});
