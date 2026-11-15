import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import {
  initializePaddleOnce,
  isValidTransactionParam,
  resolvePayConfig,
  type PaddleEventData,
  type PaddleGlobal,
} from "@/lib/billing/paddle-js";
import { PayCheckout } from "@/components/billing/PayCheckout";

const TXN = "txn_01hxxxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_SANDBOX = "test_0123456789abcdef0123456789a";
const TOKEN_LIVE = "live_0123456789abcdef0123456789a";

function fakePaddle() {
  let cb: ((e: PaddleEventData) => void) | undefined;
  const paddle = {
    Environment: { set: vi.fn() },
    Initialize: vi.fn((o: { eventCallback?: (e: PaddleEventData) => void }) => { cb = o.eventCallback; }),
  };
  return { paddle: paddle as unknown as PaddleGlobal & typeof paddle, emit: (e: PaddleEventData) => cb?.(e) };
}

describe("resolvePayConfig (server-side contract)", () => {
  it("is unconfigured without a client token", () => {
    expect(resolvePayConfig({})).toEqual({ state: "unconfigured" });
    expect(resolvePayConfig({ PADDLE_CLIENT_TOKEN: "  " })).toEqual({ state: "unconfigured" });
  });
  it("PADDLE_ENV=sandbox (and the fail-safe default) requires a test_ token", () => {
    expect(resolvePayConfig({ PADDLE_ENV: "sandbox", PADDLE_CLIENT_TOKEN: TOKEN_SANDBOX })).toEqual({ state: "ready", environment: "sandbox", token: TOKEN_SANDBOX });
    expect(resolvePayConfig({ PADDLE_CLIENT_TOKEN: TOKEN_SANDBOX })).toMatchObject({ state: "ready", environment: "sandbox" });
    expect(resolvePayConfig({ PADDLE_ENV: "sandbox", PADDLE_CLIENT_TOKEN: TOKEN_LIVE })).toEqual({ state: "token_mismatch" });
  });
  it("production requires a live_ token", () => {
    expect(resolvePayConfig({ PADDLE_ENV: "production", PADDLE_CLIENT_TOKEN: TOKEN_LIVE })).toMatchObject({ state: "ready", environment: "production" });
    expect(resolvePayConfig({ PADDLE_ENV: "production", PADDLE_CLIENT_TOKEN: TOKEN_SANDBOX })).toEqual({ state: "token_mismatch" });
  });
  it("never reads server secrets", () => {
    const cfg = resolvePayConfig({ PADDLE_ENV: "sandbox", PADDLE_CLIENT_TOKEN: TOKEN_SANDBOX, PADDLE_API_KEY: "secret_key", PADDLE_WEBHOOK_SECRET: "whsec" });
    expect(JSON.stringify(cfg)).not.toMatch(/secret_key|whsec/);
  });
});

describe("_ptxn validation", () => {
  it("accepts a Paddle transaction id and rejects everything else", () => {
    expect(isValidTransactionParam(TXN)).toBe(true);
    for (const v of [null, undefined, "", "txn_", "pri_01hxxxxxxxxxxxxxxxxxxxxxxx", "txn_<script>", `${TXN}&x=1`, "javascript:alert(1)"]) {
      expect(isValidTransactionParam(v as string | null | undefined)).toBe(false);
    }
  });
});

describe("initializePaddleOnce", () => {
  it("sets the sandbox environment and initializes exactly once however often it is called", () => {
    const { paddle } = fakePaddle();
    const win = {} as Window;
    expect(initializePaddleOnce(paddle, { environment: "sandbox", token: TOKEN_SANDBOX }, undefined, win)).toBe(true);
    expect(initializePaddleOnce(paddle, { environment: "sandbox", token: TOKEN_SANDBOX }, undefined, win)).toBe(false);
    expect(initializePaddleOnce(paddle, { environment: "sandbox", token: TOKEN_SANDBOX }, undefined, win)).toBe(false);
    expect(paddle.Environment.set).toHaveBeenCalledTimes(1);
    expect(paddle.Environment.set).toHaveBeenCalledWith("sandbox");
    expect(paddle.Initialize).toHaveBeenCalledTimes(1);
    expect(paddle.Initialize).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN_SANDBOX }));
  });
  it("production does not switch to the sandbox environment", () => {
    const { paddle } = fakePaddle();
    initializePaddleOnce(paddle, { environment: "production", token: TOKEN_LIVE }, undefined, {} as Window);
    expect(paddle.Environment.set).not.toHaveBeenCalled();
    expect(paddle.Initialize).toHaveBeenCalledTimes(1);
  });
});

describe("<PayCheckout />", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockClear();
    delete (window as unknown as Record<string, unknown>).__opsiqPaddleInitialized;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).Paddle;
    window.history.replaceState({}, "", "/");
  });

  const ready = { state: "ready", environment: "sandbox", token: TOKEN_SANDBOX } as const;

  it("initializes Paddle.js exactly once, even under React StrictMode double effects", async () => {
    const { paddle } = fakePaddle();
    (window as unknown as Record<string, unknown>).Paddle = paddle;
    window.history.replaceState({}, "", `/pay?_ptxn=${TXN}`);
    render(<StrictMode><PayCheckout config={ready} /></StrictMode>);
    await waitFor(() => expect(paddle.Initialize).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(paddle.Environment.set).toHaveBeenCalledTimes(1);
    expect(paddle.Initialize).toHaveBeenCalledTimes(1);
    expect(paddle.Initialize).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN_SANDBOX }));
  });

  it("frontend payment events are display-only: no network call, no entitlement request", async () => {
    const { paddle, emit } = fakePaddle();
    (window as unknown as Record<string, unknown>).Paddle = paddle;
    window.history.replaceState({}, "", `/pay?_ptxn=${TXN}`);
    render(<PayCheckout config={ready} />);
    await waitFor(() => expect(paddle.Initialize).toHaveBeenCalled());
    emit({ name: "checkout.completed" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/confirming it with our payment provider/));
    emit({ name: "checkout.closed" });
    expect(screen.getByRole("status").textContent).toMatch(/Payment received/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a safe error and does not initialize when the transaction parameter is missing or malformed", async () => {
    const { paddle } = fakePaddle();
    (window as unknown as Record<string, unknown>).Paddle = paddle;
    window.history.replaceState({}, "", "/pay?_ptxn=<script>alert(1)</script>");
    render(<PayCheckout config={ready} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/starts from your OpsIQ billing page|checkout started from your OpsIQ billing page/));
    expect(paddle.Initialize).not.toHaveBeenCalled();
  });

  it("does not initialize when unconfigured or when the token does not match the environment", () => {
    const { paddle } = fakePaddle();
    (window as unknown as Record<string, unknown>).Paddle = paddle;
    window.history.replaceState({}, "", `/pay?_ptxn=${TXN}`);
    render(<PayCheckout config={{ state: "token_mismatch" }} />);
    expect(screen.getByRole("status").textContent).toMatch(/not available/);
    cleanup();
    render(<PayCheckout config={{ state: "unconfigured" }} />);
    expect(paddle.Initialize).not.toHaveBeenCalled();
  });

  it("shows an error state when Paddle.js cannot be loaded", async () => {
    window.history.replaceState({}, "", `/pay?_ptxn=${TXN}`);
    // no window.Paddle: the loader injects a script that never loads; simulate its error event
    render(<PayCheckout config={ready} />);
    const script = await waitFor(() => {
      const el = document.getElementById("opsiq-paddle-js");
      if (!el) throw new Error("script not injected yet");
      return el;
    });
    expect(script.getAttribute("src")).toBe("https://cdn.paddle.com/paddle/v2/paddle.js");
    script.dispatchEvent(new Event("error"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/could not load the secure checkout/));
    script.remove();
  });
});

describe("/pay surface hygiene (source contract)", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const files = ["app/pay/page.tsx", "components/billing/PayCheckout.tsx", "lib/billing/paddle-js.ts"];

  it("contains no server secrets, session, database or tenant data", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/PADDLE_API_KEY|PADDLE_WEBHOOK_SECRET|@\/lib\/db|getSession|getPolicyContext|workspace/i);
    }
  });
  it("is not indexed and uses dynamic rendering so the token/env are read at request time", () => {
    const src = read("app/pay/page.tsx");
    expect(src).toContain('index: false');
    expect(src).toContain('force-dynamic');
    expect(src).toContain("process.env");
  });
  it("CSP for /pay is the only place that allows Paddle.js and the Paddle checkout frame", () => {
    const cfg = fs.readFileSync(path.resolve(root, "../next.config.ts"), "utf8");
    expect(cfg).toContain('source: "/pay"');
    expect(cfg).toContain("https://cdn.paddle.com");
    expect((cfg.match(/cdn\.paddle\.com/g) ?? []).length).toBe(1);
  });
});
