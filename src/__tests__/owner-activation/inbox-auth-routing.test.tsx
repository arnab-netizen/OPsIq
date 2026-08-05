/**
 * /dashboard/inbox authentication routing — closes the HTTP 500 defect.
 *
 * The page previously threw on a missing session and on a missing workspace membership, and it lived
 * outside the (authenticated) route group, so nothing caught either throw: an anonymous visitor got a
 * 500 instead of a login redirect, and an authenticated owner got a page with no app shell.
 *
 * It now lives inside (authenticated) — so the layout guard applies and the sidebar renders — and the
 * page keeps its own checks as defence in depth. These tests exercise the page's own checks directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const getSessionMock = vi.fn();
const findFirstMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  // Mirror next/navigation: redirect() interrupts rendering by throwing.
  const err = new Error(`NEXT_REDIRECT:${path}`);
  (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
  throw err;
});

vi.mock("next/navigation", () => ({ redirect: (p: string) => redirectMock(p) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/services/auth", () => ({ getSession: () => getSessionMock() }));
vi.mock("@/lib/db", () => ({
  db: { workspaceMembership: { findFirst: (args: unknown) => findFirstMock(args) } },
}));
vi.mock("@/app/(authenticated)/dashboard/inbox/inbox-client", () => ({
  InboxClient: ({ workspaceId }: { workspaceId: string }) => <div data-testid="inbox-client">{workspaceId}</div>,
}));

import DashboardInboxPage, { metadata } from "@/app/(authenticated)/dashboard/inbox/page";

beforeEach(() => {
  getSessionMock.mockReset();
  findFirstMock.mockReset();
  redirectMock.mockClear();
});
afterEach(() => cleanup());

describe("unauthenticated access", () => {
  it("redirects to /login instead of throwing a generic error", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(DashboardInboxPage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("runs no database query before authentication is established", async () => {
    getSessionMock.mockResolvedValue(null);
    await DashboardInboxPage().catch(() => undefined);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("treats a session without a user id as unauthenticated", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    await expect(DashboardInboxPage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});

describe("authenticated access", () => {
  it("renders the inbox for an owner with an active membership", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    findFirstMock.mockResolvedValue({ workspaceId: "ws-1" });
    const { getByTestId } = render(await DashboardInboxPage());
    expect(getByTestId("inbox-client").textContent).toBe("ws-1");
  });

  it("scopes the membership lookup to the session user and active memberships only", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    findFirstMock.mockResolvedValue({ workspaceId: "ws-1" });
    await DashboardInboxPage();
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", isActive: true } }),
    );
  });

  it("shows a controlled state — not a 500 — when the user has no active workspace", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    findFirstMock.mockResolvedValue(null);
    const { getByTestId, queryByTestId } = render(await DashboardInboxPage());
    expect(getByTestId("inbox-no-workspace")).toBeTruthy();
    // Fail closed: no decision data is rendered.
    expect(queryByTestId("inbox-client")).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("does not fall back to another user's workspace when membership is inactive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    findFirstMock.mockResolvedValue({ workspaceId: null });
    const { getByTestId } = render(await DashboardInboxPage());
    expect(getByTestId("inbox-no-workspace")).toBeTruthy();
  });
});

describe("metadata", () => {
  it("uses the OpsIQ product name", () => {
    expect(metadata.title).toContain("OpsIQ");
    expect(metadata.title).not.toContain("Rebilix");
  });
});
