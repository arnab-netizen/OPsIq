"use client";

/**
 * Anonymous funnel events from the public site. Name only — the server accepts a closed allowlist and no
 * payload, so nothing about the visitor or the business can be sent through here.
 */
import type { ProductEventName } from "@/domain/analytics/product-events";

export function reportAnonymousProductEvent(name: Extract<ProductEventName, "public_start_free_clicked" | "signup_started">): void {
  try {
    // sendBeacon is a fire-and-forget delivery that survives navigation; browsers without it simply skip the event
    // (analytics must never affect the page, and there is deliberately no retry or fallback request).
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon("/api/product-events", new Blob([JSON.stringify({ name })], { type: "application/json" }));
  } catch {
    /* analytics must never affect the page */
  }
}
