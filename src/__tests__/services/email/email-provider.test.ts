/**
 * Email provider unit tests — validates Resend HTTP transport contract.
 * Uses fetch mock; no real network calls.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  getEmailProvider,
  resetEmailProvider,
  type EmailMessage,
} from "@/lib/integrations/email-provider";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetEmailProvider();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEmailProvider();
});

describe("getEmailProvider", () => {
  it("returns null when RESEND_API_KEY is not set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const provider = getEmailProvider();
    expect(provider).toBeNull();
  });

  it("returns a provider instance when RESEND_API_KEY is set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const provider = getEmailProvider();
    expect(provider).not.toBeNull();
    expect(typeof provider?.send).toBe("function");
  });

  it("caches the provider instance across calls", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const p1 = getEmailProvider();
    const p2 = getEmailProvider();
    expect(p1).toBe(p2);
  });

  it("returns fresh instance after reset", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const p1 = getEmailProvider();
    resetEmailProvider();
    const p2 = getEmailProvider();
    expect(p1).not.toBe(p2);
  });
});

describe("ResendEmailProvider.send", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    vi.stubEnv("ALERT_FROM_EMAIL", "alerts@opsiq.app");
  });

  it("POSTs to Resend API with correct payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "email-id-001" }),
    });

    const provider = getEmailProvider()!;
    const message: EmailMessage = {
      to: "user@example.com",
      subject: "Test Alert",
      html: "<p>Test</p>",
      text: "Test",
    };

    const result = await provider.send(message);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key_123",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Test Alert");
    expect(body.from).toBe("alerts@opsiq.app");
    expect(result.accepted).toBe(true);
    expect(result.id).toBe("email-id-001");
  });

  it("handles array of recipients", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ id: "email-id-002" }),
    });

    const provider = getEmailProvider()!;
    await provider.send({
      to: ["a@example.com", "b@example.com"],
      subject: "Multi-recipient",
      html: "<p>Hi</p>",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("uses custom from address when provided in message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({}),
    });

    const provider = getEmailProvider()!;
    await provider.send({
      to: "user@example.com",
      subject: "Custom from",
      html: "<p>Hi</p>",
      from: "custom@opsiq.app",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe("custom@opsiq.app");
  });

  it("throws on non-ok API response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: "Invalid recipient" }),
    });

    const provider = getEmailProvider()!;
    await expect(
      provider.send({ to: "bad", subject: "X", html: "<p>X</p>" })
    ).rejects.toThrow("Resend API error 422");
  });
});
