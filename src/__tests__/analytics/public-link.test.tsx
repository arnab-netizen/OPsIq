// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// next/link marks itself so a client-side transition is distinguishable from a plain full-document anchor.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-soft-nav="true" {...rest}>
      {children}
    </a>
  ),
}));

import { PublicLink } from "@/components/navigation/PublicLink";
import { PublicSiteHeader } from "@/components/landing/PublicSiteHeader";

afterEach(() => cleanup());

describe("PublicLink", () => {
  it.each(["/login", "/signup", "/signup?ref=x", "/owner/cockpit", "/admin/users", "/dashboard/home", "/forgot-password"])(
    "%s is a full-document navigation (plain anchor, not a client-side Link)",
    (href) => {
      render(<PublicLink href={href}>go</PublicLink>);
      const a = screen.getByRole("link");
      expect(a.getAttribute("href")).toBe(href);
      expect(a.getAttribute("data-soft-nav")).toBeNull();
    },
  );

  it("'/' is a full-document navigation: the homepage redirects signed-in visitors into the private app", () => {
    render(<PublicLink href="/">home</PublicLink>);
    expect(screen.getByRole("link").getAttribute("data-soft-nav")).toBeNull();
  });

  it.each(["/about", "/resources", "/resources/x", "/tools/profit-margin-calculator", "/privacy", "/terms", "/beta"])(
    "%s between public pages stays a client-side Link",
    (href) => {
      render(<PublicLink href={href}>go</PublicLink>);
      expect(screen.getByRole("link").getAttribute("data-soft-nav")).toBe("true");
    },
  );

  it("passes attributes through on both branches", () => {
    render(
      <>
        <PublicLink href="/login" className="a" data-testid="hard">x</PublicLink>
        <PublicLink href="/about" className="b" data-testid="soft">y</PublicLink>
      </>,
    );
    expect(screen.getByTestId("hard").className).toBe("a");
    expect(screen.getByTestId("soft").className).toBe("b");
  });
});

describe("public → login boundary on the real header", () => {
  it("the 'Sign in' link in the shared public header is a full-document navigation to /login", () => {
    render(<PublicSiteHeader />);
    const signIn = screen.getByRole("link", { name: /sign in/i });
    expect(signIn.getAttribute("href")).toBe("/login");
    expect(signIn.getAttribute("data-soft-nav")).toBeNull();
    // the logo link back home is a full-document load too (the homepage redirects signed-in visitors into the app)
    expect(screen.getByRole("link", { name: /opsiq home/i }).getAttribute("data-soft-nav")).toBeNull();
    // while public-to-public navigation stays client-side
    expect(screen.getByRole("link", { name: /calculators/i }).getAttribute("data-soft-nav")).toBe("true");
  });
});
