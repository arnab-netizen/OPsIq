"use client";

/**
 * Anonymous funnel events from the public site. Name only — the server accepts a closed allowlist and no
 * payload, so nothing about the visitor or the business can be sent through here.
 */
import type { ProductEventName } from "@/domain/analytics/product-events";

export function reportAnonymousProductEvent(name: Extract<ProductEventName, "public_start_free_clicked" | "signup_started">): void {
  try {
    const body = JSON.stringify({ name });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon("/api/product-events", new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    void fetch("/api/product-events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* analytics must never affect the page */
  }
}
