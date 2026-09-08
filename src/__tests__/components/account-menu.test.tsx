/**
 * A real usability test found the header's avatar was a non-interactive <div> and "Log out" sat
 * exposed as a standalone button — one accidental click could end an owner's session. This proves
 * the replacement: a real account menu, closed by default, whose destinations are all real,
 * already-existing pages, and whose logout action requires a deliberate open-then-click.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { AccountMenu } from "@/components/owner/AccountMenu";

vi.mock("@/hooks/useOperatorMutation", () => ({
  useOperatorMutation: () => ({ mutate: vi.fn(), isLoading: false }),
}));

afterEach(() => cleanup());

describe("AccountMenu", () => {
  it("renders closed by default — no menu items visible until opened", () => {
    render(<AccountMenu userName="Ada" />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
  });

  it("opens on click and shows only real, existing destinations", () => {
    render(<AccountMenu userName="Ada" />);
    fireEvent.click(screen.getByTestId("account-menu-trigger"));

    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();

    const account = screen.getByRole("menuitem", { name: "Account" });
    expect(account).toHaveAttribute("href", "/settings");

    const help = screen.getByRole("menuitem", { name: "Help" });
    expect(help).toHaveAttribute("href", "/owner/help");

    const feedback = screen.getByRole("menuitem", { name: "Send feedback" });
    expect(feedback).toHaveAttribute("href", "/owner/feedback");

    expect(screen.getByTestId("account-menu-logout")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<AccountMenu userName="Ada" />);
    fireEvent.click(screen.getByTestId("account-menu-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <AccountMenu userName="Ada" />
      </div>
    );
    fireEvent.click(screen.getByTestId("account-menu-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
