// @vitest-environment jsdom
/**
 * Consent-gated Clarity: every gate fails closed, and the privacy boundary destroys the document.
 * jsdom does not execute injected <script src>, so "loaded" is observed as the loader element in the document.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

let mockPathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));
const nav = vi.hoisted(() => ({ reloadDocument: vi.fn(), replaceDocument: vi.fn(), assignDocument: vi.fn() }));
vi.mock("@/lib/analytics/document-navigation", () => nav);

const KEY = "opsiq_analytics_consent_v1";
const ID = "ymoglnln74";
const TAG = `https://www.clarity.ms/tag/${ID}`;

const ALLOWLISTED = ["/", "/about", "/resources", "/resources/some-article", "/tools/profit-margin-calculator", "/tools/another", "/privacy", "/terms", "/beta"];

type ClarityWindow = Window & { clarity?: ((...a: unknown[]) => void) & { q?: IArguments[] } };

/** Fresh module instance per test: the "loaded in this document" flag is module state that dies with a real document. */
async function mount(path: string, projectId: string = ID) {
  vi.resetModules();
  mockPathname = path;
  const { ClarityConsent } = await import("@/components/analytics/ClarityConsent");
  const utils = render(<ClarityConsent projectId={projectId} />);
  await act(async () => {});
  return { ...utils, ClarityConsent };
}
const scripts = () => Array.from(document.querySelectorAll("script")).filter((s) => /clarity\.ms/.test(s.src));
const queuedCommands = () => Array.from(((window as ClarityWindow).clarity?.q ?? []) as IArguments[]).map((a) => Array.from(a));

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = "";
  document.cookie = "";
  delete (window as ClarityWindow).clarity;
  Object.values(nav).forEach((f) => f.mockReset());
});
afterEach(() => cleanup());

describe("no consent => Clarity absent", () => {
  it.each(ALLOWLISTED)("no preference on %s: no loader, no clarity global, banner offered", async (path) => {
    await mount(path);
    expect(scripts()).toHaveLength(0);
    expect((window as ClarityWindow).clarity).toBeUndefined();
    expect(screen.getByTestId("analytics-consent")).toBeTruthy();
  });

  it("denied: no loader, no banner", async () => {
    window.localStorage.setItem(KEY, "denied");
    await mount("/");
    expect(scripts()).toHaveLength(0);
    expect((window as ClarityWindow).clarity).toBeUndefined();
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
  });

  it.each(["true", "1", "GRANTED", "granted ", " granted", "yes", "{\"v\":\"granted\"}", "granted,denied", "", "null"])(
    "malformed preference %j fails closed (no loader) and asks again",
    async (raw) => {
      window.localStorage.setItem(KEY, raw);
      await mount("/");
      expect(scripts()).toHaveLength(0);
      expect(screen.getByTestId("analytics-consent")).toBeTruthy();
    },
  );

  it("a stored value from another key/version is ignored", async () => {
    window.localStorage.setItem("opsiq_analytics_consent_v0", "granted");
    window.localStorage.setItem("opsiq_analytics_consent_v2", "granted");
    await mount("/");
    expect(scripts()).toHaveLength(0);
  });

  it("blocked storage behaves as no choice (no loader) and does not throw", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await mount("/");
    expect(scripts()).toHaveLength(0);
    expect(screen.getByTestId("analytics-consent")).toBeTruthy();
    spy.mockRestore();
  });

  it("choosing in-page without persistence still loads only after the explicit click", async () => {
    await mount("/about");
    expect(scripts()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("analytics-allow"));
    await act(async () => {});
    expect(scripts()).toHaveLength(1);
  });
});

describe("granted => Clarity allowed on every allowlisted route", () => {
  it.each(ALLOWLISTED)("loads once on %s with the exact tag URL and Consent API v2", async (path) => {
    window.localStorage.setItem(KEY, "granted");
    await mount(path);
    const found = scripts();
    expect(found).toHaveLength(1);
    expect(found[0].src).toBe(TAG);
    expect(found[0].async).toBe(true);
    // The consent signal is the FIRST queued command, before the runtime exists; nothing else is ever issued.
    expect(queuedCommands()).toEqual([["consentv2", { analytics_Storage: "granted", ad_Storage: "denied" }]]);
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
  });

  it("never issues identify, set, event or upgrade", async () => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/");
    const verbs = queuedCommands().map((c) => c[0]);
    for (const banned of ["identify", "set", "event", "upgrade", "consent"]) expect(verbs).not.toContain(banned);
  });

  it("does not add the loader twice on re-render", async () => {
    window.localStorage.setItem(KEY, "granted");
    const { rerender, ClarityConsent } = await mount("/");
    rerender(<ClarityConsent projectId={ID} />);
    await act(async () => {});
    expect(scripts()).toHaveLength(1);
  });
});

describe("configuration and route gates fail closed even with consent", () => {
  it.each(["", "   ", "bad id!", "../x", "x".repeat(40)])("project id %j => nothing is loaded and no banner", async (id) => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/", id);
    expect(scripts()).toHaveLength(0);
    expect((window as ClarityWindow).clarity).toBeUndefined();
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
  });

  it.each(["/pricing", "/blog", "/aboutx", "/resourcesx", "/tools", "/resources/../login", "/Login"])("unknown route %s => nothing, no banner", async (path) => {
    window.localStorage.setItem(KEY, "granted");
    await mount(path);
    expect(scripts()).toHaveLength(0);
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
  });

  it.each([
    "/login", "/signup", "/owner/cockpit", "/owner/finance", "/admin", "/admin/users", "/dashboard", "/dashboard/x", "/api/auth/signin", "/auth/callback",
    "/forgot-password", "/reset-password", "/verify-email", "/onboarding",
  ])("excluded route %s => zero Clarity, no banner, no clarity global — even with consent granted", async (path) => {
    window.localStorage.setItem(KEY, "granted");
    await mount(path);
    expect(scripts()).toHaveLength(0);
    expect((window as ClarityWindow).clarity).toBeUndefined();
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
    expect(nav.replaceDocument).not.toHaveBeenCalled(); // nothing was loaded, so nothing needs destroying
  });
});

describe("privacy boundary: a Clarity document never survives into a non-eligible route", () => {
  it("reloads the document if a Clarity-loaded page lands on /login", async () => {
    window.localStorage.setItem(KEY, "granted");
    const { rerender, ClarityConsent } = await mount("/about");
    expect(scripts()).toHaveLength(1);
    mockPathname = "/login";
    rerender(<ClarityConsent projectId={ID} />);
    await act(async () => {});
    expect(nav.replaceDocument).toHaveBeenCalledTimes(1);
  });

  it.each(["/signup", "/owner/cockpit", "/admin/x", "/dashboard/x", "/pricing"])("same backstop for %s", async (path) => {
    window.localStorage.setItem(KEY, "granted");
    const { rerender, ClarityConsent } = await mount("/");
    mockPathname = path;
    rerender(<ClarityConsent projectId={ID} />);
    await act(async () => {});
    expect(nav.replaceDocument).toHaveBeenCalled();
  });

  it("moving between public pages does not reload", async () => {
    window.localStorage.setItem(KEY, "granted");
    const { rerender, ClarityConsent } = await mount("/");
    mockPathname = "/resources/a-guide";
    rerender(<ClarityConsent projectId={ID} />);
    await act(async () => {});
    expect(nav.replaceDocument).not.toHaveBeenCalled();
    expect(scripts()).toHaveLength(1);
  });

  it("while loaded, a click on an in-app link to /login becomes a full-document navigation before the router sees it", async () => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/");
    const link = document.createElement("a");
    link.href = "/login";
    document.body.appendChild(link);
    const routerHandler = vi.fn();
    document.body.addEventListener("click", routerHandler); // stands in for React/Next's bubbling handlers
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(routerHandler).not.toHaveBeenCalled();
    expect(nav.assignDocument).toHaveBeenCalledWith(expect.stringMatching(/\/login$/));
  });

  it.each(["/signup", "/owner/cockpit", "/admin/users", "/dashboard/x"])("click guard also covers %s", async (href) => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/beta");
    const link = document.createElement("a");
    link.href = href;
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(nav.assignDocument).toHaveBeenCalledTimes(1);
  });

  it("leaves public, external, new-tab and modified clicks alone", async () => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/");
    const make = (href: string, attrs: Record<string, string> = {}) => {
      const a = document.createElement("a");
      a.href = href;
      Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
      document.body.appendChild(a);
      return a;
    };
    make("/about").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    make("https://example.com/login").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    make("/login", { target: "_blank" }).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    make("/login").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    expect(nav.assignDocument).not.toHaveBeenCalled();
  });

  it("does not install the click guard when nothing is loaded", async () => {
    await mount("/");
    const link = document.createElement("a");
    link.href = "/login";
    document.body.appendChild(link);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(nav.assignDocument).not.toHaveBeenCalled();
  });
});

describe("withdrawal persists denied and reloads", () => {
  it("Decline after Clarity loaded: persists denied, clears Clarity cookies and reloads the document", async () => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/");
    expect(scripts()).toHaveLength(1);
    document.cookie = "_clck=abc; Path=/";
    document.cookie = "_clsk=def; Path=/";
    await act(async () => {
      window.dispatchEvent(new Event("opsiq:open-analytics-preferences"));
    });
    expect(screen.getByTestId("analytics-consent-current").textContent).toMatch(/allowed/);
    fireEvent.click(screen.getByTestId("analytics-decline"));
    expect(window.localStorage.getItem(KEY)).toBe("denied");
    expect(nav.reloadDocument).toHaveBeenCalledTimes(1);
    expect(document.cookie).not.toMatch(/_clck|_clsk/);
  });

  it("a withdrawal made in ANOTHER tab also destroys the running Clarity document", async () => {
    window.localStorage.setItem(KEY, "granted");
    await mount("/");
    expect(scripts()).toHaveLength(1);
    window.localStorage.setItem(KEY, "denied"); // the other tab's write
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "denied" }));
    });
    expect(nav.reloadDocument).toHaveBeenCalled();
  });

  it("a fresh document after withdrawal loads nothing", async () => {
    window.localStorage.setItem(KEY, "denied");
    await mount("/");
    expect(scripts()).toHaveLength(0);
  });

  it("Decline on first ask persists denied without reloading and never loads", async () => {
    await mount("/");
    fireEvent.click(screen.getByTestId("analytics-decline"));
    await act(async () => {});
    expect(window.localStorage.getItem(KEY)).toBe("denied");
    expect(nav.reloadDocument).not.toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);
    expect(screen.queryByTestId("analytics-consent")).toBeNull();
  });

  it("the preference can be reopened after declining and switched to allow", async () => {
    window.localStorage.setItem(KEY, "denied");
    await mount("/");
    await act(async () => {
      window.dispatchEvent(new Event("opsiq:open-analytics-preferences"));
    });
    expect(screen.getByTestId("analytics-consent-current").textContent).toMatch(/declined/);
    fireEvent.click(screen.getByTestId("analytics-allow"));
    await act(async () => {});
    expect(window.localStorage.getItem(KEY)).toBe("granted");
    expect(scripts()).toHaveLength(1);
  });

  it("stores only the choice: no identity or business data in anything persisted", async () => {
    await mount("/");
    fireEvent.click(screen.getByTestId("analytics-allow"));
    await act(async () => {});
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(KEY)).toBe("granted");
  });
});

describe("the choice can be changed later from every eligible page", () => {
  it.each(ALLOWLISTED)("%s offers a persistent 'Analytics preferences' control once a choice exists (granted or denied)", async (path) => {
    for (const choice of ["granted", "denied"]) {
      cleanup();
      window.localStorage.setItem(KEY, choice);
      document.head.innerHTML = "";
      delete (window as ClarityWindow).clarity;
      await mount(path);
      expect(screen.getByTestId("analytics-preferences-floating").textContent).toBe("Analytics preferences");
      fireEvent.click(screen.getByTestId("analytics-preferences-floating"));
      await act(async () => {});
      expect(screen.getByTestId("analytics-consent-current").textContent).toMatch(choice === "granted" ? /allowed/ : /declined/);
    }
  });
  it("is never shown on excluded or unknown routes, or when Clarity is not configured", async () => {
    window.localStorage.setItem(KEY, "granted");
    for (const path of ["/login", "/signup", "/owner/cockpit", "/admin", "/dashboard", "/pricing"]) {
      cleanup();
      await mount(path);
      expect(screen.queryByTestId("analytics-preferences-floating")).toBeNull();
    }
    cleanup();
    await mount("/", "");
    expect(screen.queryByTestId("analytics-preferences-floating")).toBeNull();
  });
});

describe("no dark patterns", () => {
  it("Allow and Decline have the same variant/size classes and both are buttons", async () => {
    await mount("/");
    const allow = screen.getByTestId("analytics-allow");
    const decline = screen.getByTestId("analytics-decline");
    expect(allow.tagName).toBe("BUTTON");
    expect(decline.tagName).toBe("BUTTON");
    expect(allow.className).toBe(decline.className);
    expect(screen.getByTestId("analytics-consent").textContent).toMatch(/Declining changes nothing/);
  });
});
