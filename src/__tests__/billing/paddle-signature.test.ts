import { describe, it, expect } from "vitest";
import {
  PaddleSignatureError,
  computePaddleSignature,
  verifyPaddleSignature,
} from "@/services/billing/paddle-signature";

const SECRET = "pdl_ntfset_test_secret";
const NOW = 1_800_000_000;
const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" });
const header = (ts: number, raw = body, secret = SECRET) => `ts=${ts};h1=${computePaddleSignature(secret, String(ts), raw)}`;

describe("Paddle signature verification (fail closed)", () => {
  it("accepts a correctly signed, fresh delivery", () => {
    expect(verifyPaddleSignature({ rawBody: body, header: header(NOW), secret: SECRET, nowSeconds: NOW })).toEqual({ ts: NOW });
  });
  it("accepts when any one of several h1 values matches (key rotation)", () => {
    const h = `ts=${NOW};h1=${"0".repeat(64)};h1=${computePaddleSignature(SECRET, String(NOW), body)}`;
    expect(() => verifyPaddleSignature({ rawBody: body, header: h, secret: SECRET, nowSeconds: NOW })).not.toThrow();
  });
  it("rejects a forged signature (wrong secret)", () => {
    expect(() =>
      verifyPaddleSignature({ rawBody: body, header: header(NOW, body, "attacker"), secret: SECRET, nowSeconds: NOW }),
    ).toThrow(PaddleSignatureError);
  });
  it("rejects a tampered body", () => {
    expect(() =>
      verifyPaddleSignature({ rawBody: body + " ", header: header(NOW), secret: SECRET, nowSeconds: NOW }),
    ).toThrow("signature mismatch");
  });
  it("rejects a replay outside the tolerance window", () => {
    expect(() =>
      verifyPaddleSignature({ rawBody: body, header: header(NOW - 301), secret: SECRET, nowSeconds: NOW }),
    ).toThrow("timestamp outside tolerance");
  });
  it("rejects when the secret is not configured", () => {
    expect(() => verifyPaddleSignature({ rawBody: body, header: header(NOW), secret: undefined, nowSeconds: NOW })).toThrow(
      "not configured",
    );
    expect(() => verifyPaddleSignature({ rawBody: body, header: header(NOW), secret: "", nowSeconds: NOW })).toThrow();
  });
  it("rejects missing or malformed headers", () => {
    for (const h of [null, undefined, "", "garbage", "ts=abc;h1=zz", `ts=${NOW}`, `h1=${"a".repeat(64)}`]) {
      expect(() => verifyPaddleSignature({ rawBody: body, header: h, secret: SECRET, nowSeconds: NOW })).toThrow(
        PaddleSignatureError,
      );
    }
  });
});
