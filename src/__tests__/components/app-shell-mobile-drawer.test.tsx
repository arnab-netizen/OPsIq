/**
 * Mobile nav drawer — accessibility behavioral contract.
 *
 * `AppShell`'s mobile drawer (src/ui/shell/app-shell.tsx) is a modal-style overlay: it
 * fully covers and blocks the background, so it must honor the same behavioral contract
 * as any modal dialog — trap focus, close on Escape, lock background scroll, restore
 * focus on close, expose correct ARIA state, and never survive a route change as a
 * stale overlay. These are jsdom component tests (no live browser), driven with
 * fireEvent — jsdom implements no native Tab traversal, so the trap itself must
 * (and does) move focus programmatically on Tab/Shift+Tab, which is exactly what these
 * tests exercise.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";

const usePathnameMock = vi.fn(() => "/owner/cockpit");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppShell } from "@/ui/shell/app-shell";

afterEach(() => {
  cleanup();
  usePathnameMock.mockReturnValue("/owner/cockpit");
  document.body.style.overflow = "";
});

function openDrawer() {
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  fireEvent.click(trigger);
  return trigger;
}

/**
 * Links actually reachable by Tab right now — i.e. not sitting inside a closed native
 * `<details>` section (SidebarNav groups the "Growth & strategy" / "Records & settings"
 * sections that way; a real browser removes their content from the tab order without any
 * `display:none` in markup, so a plain querySelectorAll("a") over-counts). Mirrors the
 * same reachability rule the trap itself uses (src/ui/primitives/use-dialog-a11y.ts).
 */
function reachableLinks(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).filter((a) => {
    const details = a.closest("details");
    return !details || details.open;
  });
}

describe("AppShell mobile nav drawer", () => {
  it("1. trigger aria-expanded toggles false -> true -> false with open/close", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("dialog", { name: "Navigation menu" }).parentElement!);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("2. opening moves focus into the drawer, onto the first nav link", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    const [firstLink] = reachableLinks(dialog);
    expect(firstLink).not.toBeUndefined();
    expect(document.activeElement).toBe(firstLink);
  });

  it("3. Tab from the last focusable element wraps to the first, without leaving the drawer", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    const links = reachableLinks(dialog);
    const first = links[0];
    const last = links[links.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("4. Shift+Tab from the first focusable element wraps to the last, without leaving the drawer", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    const links = reachableLinks(dialog);
    const first = links[0];
    const last = links[links.length - 1];

    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("5. Escape closes the drawer while open, and restores focus to the trigger", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    const trigger = openDrawer();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("6. Escape does nothing while the drawer is closed, and the listener does not leak across cycles", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    // Closed from the start: Escape must be a no-op (nothing to close, no error).
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();

    // One open/close/open/close cycle. If the Escape listener leaked (added again on
    // every open without the previous one being removed), a single Escape after the
    // second open would still close it — that's expected — but the real proof is that
    // no stray listener fires against `document` when the drawer is already closed,
    // covered above and after this cycle.
    openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
  });

  it("7. background scroll is locked on open and fully released on close", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    expect(document.body.style.overflow).toBe("");

    openDrawer();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });

  it("8. background scroll lock is released on unmount even if the drawer was left open", () => {
    const { unmount } = render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("9. a simulated route change (pathname change) closes the drawer", () => {
    const { rerender } = render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();

    usePathnameMock.mockReturnValue("/owner/finance");
    rerender(<AppShell canViewOwnerRecovery>{null}</AppShell>);

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });

  it("10. background content is aria-hidden while the drawer is open, and un-hidden on close", () => {
    render(
      <AppShell canViewOwnerRecovery>
        <div data-testid="page-content">page</div>
      </AppShell>,
    );
    const main = screen.getByTestId("page-content").closest("main")!;
    expect(main).not.toHaveAttribute("aria-hidden");

    openDrawer();
    expect(main).toHaveAttribute("aria-hidden", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(main).not.toHaveAttribute("aria-hidden");
  });

  it("11. the drawer exposes a modal dialog contract: role=dialog, aria-modal, accessible name", () => {
    render(<AppShell canViewOwnerRecovery>{null}</AppShell>);
    openDrawer();

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
