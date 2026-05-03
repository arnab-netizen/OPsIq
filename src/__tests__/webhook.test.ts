import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  verifyWebhookSignature,
  getOrCreateWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
} from "@/services/webhook.service";

// Mock Stripe SDK
vi.mock("stripe", () => {
  return {
    default: vi.fn(() => ({
      webhooks: {
        constructEvent: vi.fn(),
      },
      customers: {
        create: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

// Mock environment variables
beforeEach(() => {
  process.env.STRIPE_API_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
});

describe("Webhook signature verification", () => {
  it("rejects request without stripe-signature header", async () => {
    try {
      await verifyWebhookSignature("body", "");
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("Missing stripe-signature");
    }
  });

  it("rejects request without STRIPE_WEBHOOK_SECRET", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    try {
      await verifyWebhookSignature("body", "sig_123");
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("STRIPE_WEBHOOK_SECRET");
    }
  });

  it("rejects invalid signature", async () => {
    const { default: Stripe } = await import("stripe");
    const mockStripe = Stripe();

    vi.mocked(mockStripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("Signature verification failed");
    });

    try {
      await verifyWebhookSignature("body", "invalid_sig");
      expect.fail("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("verification failed");
    }
  });
});

describe("Webhook idempotency state machine", () => {
  it("creates new event with status=processing", async () => {
    const result = await getOrCreateWebhookEvent("evt_123", "checkout.session.completed");

    expect(result.isNew).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.shouldRetry).toBe(false);
    expect(result.event.status).toBe("processing");
    expect(result.event.attempts).toBe(0);

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_123" } });
  });

  it("ignores duplicate processed event", async () => {
    // Create and process an event
    await db.webhookEvent.create({
      data: {
        stripeEventId: "evt_dup_1",
        type: "checkout.session.completed",
        status: "processed",
        processedAt: new Date(),
        attempts: 1,
      },
    });

    // Try to process again
    const result = await getOrCreateWebhookEvent("evt_dup_1", "checkout.session.completed");

    expect(result.isNew).toBe(false);
    expect(result.shouldProcess).toBe(false);
    expect(result.shouldRetry).toBe(false);
    expect(result.event.status).toBe("processed");

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_dup_1" } });
  });

  it("returns 409 conflict for event currently processing", async () => {
    // Create event in processing state
    await db.webhookEvent.create({
      data: {
        stripeEventId: "evt_proc_1",
        type: "customer.subscription.created",
        status: "processing",
        attempts: 0,
      },
    });

    // Try to process again
    const result = await getOrCreateWebhookEvent("evt_proc_1", "customer.subscription.created");

    expect(result.isNew).toBe(false);
    expect(result.shouldProcess).toBe(false);
    expect(result.event.status).toBe("processing");

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_proc_1" } });
  });

  it("allows retry of failed event", async () => {
    // Create failed event
    await db.webhookEvent.create({
      data: {
        stripeEventId: "evt_fail_1",
        type: "checkout.session.completed",
        status: "failed",
        attempts: 1,
        lastError: "Previous error",
      },
    });

    // Try to process again
    const result = await getOrCreateWebhookEvent("evt_fail_1", "checkout.session.completed");

    expect(result.isNew).toBe(false);
    expect(result.shouldProcess).toBe(true);
    expect(result.shouldRetry).toBe(true);
    expect(result.event.status).toBe("failed");

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_fail_1" } });
  });
});

describe("Webhook event state transitions", () => {
  it("marks event as processed only after success", async () => {
    const { isNew, event } = await getOrCreateWebhookEvent("evt_success_1", "checkout.session.completed");

    expect(isNew).toBe(true);
    expect(event.status).toBe("processing");
    expect(event.processedAt).toBeNull();

    // Mark as processed
    await markWebhookEventProcessed("evt_success_1");

    const updated = await db.webhookEvent.findUnique({
      where: { stripeEventId: "evt_success_1" },
    });

    expect(updated?.status).toBe("processed");
    expect(updated?.processedAt).not.toBeNull();
    expect(updated?.lastError).toBeNull();

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_success_1" } });
  });

  it("marks event as failed with error message and increments attempts", async () => {
    const { isNew, event } = await getOrCreateWebhookEvent("evt_error_1", "customer.subscription.created");

    expect(isNew).toBe(true);
    expect(event.attempts).toBe(0);

    // Mark as failed
    const error = new Error("Database connection timeout");
    await markWebhookEventFailed("evt_error_1", error);

    const updated = await db.webhookEvent.findUnique({
      where: { stripeEventId: "evt_error_1" },
    });

    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("Database connection timeout");
    expect(updated?.attempts).toBe(1);
    expect(updated?.processedAt).toBeNull();

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_error_1" } });
  });

  it("increments attempts on subsequent failures", async () => {
    // Create failed event with 1 attempt
    await db.webhookEvent.create({
      data: {
        stripeEventId: "evt_retry_fail",
        type: "checkout.session.completed",
        status: "failed",
        attempts: 1,
        lastError: "First failure",
      },
    });

    // Fail again
    const error = new Error("Second failure");
    await markWebhookEventFailed("evt_retry_fail", error);

    const updated = await db.webhookEvent.findUnique({
      where: { stripeEventId: "evt_retry_fail" },
    });

    expect(updated?.attempts).toBe(2);
    expect(updated?.lastError).toBe("Second failure");

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_retry_fail" } });
  });

  it("never marks processed before successful DB sync", async () => {
    const { isNew } = await getOrCreateWebhookEvent("evt_no_process", "checkout.session.completed");
    expect(isNew).toBe(true);

    // Verify it's still in processing state
    const event = await db.webhookEvent.findUnique({
      where: { stripeEventId: "evt_no_process" },
    });

    expect(event?.status).toBe("processing");
    expect(event?.processedAt).toBeNull();

    // Only mark processed after explicit success call
    await markWebhookEventProcessed("evt_no_process");

    const updated = await db.webhookEvent.findUnique({
      where: { stripeEventId: "evt_no_process" },
    });

    expect(updated?.status).toBe("processed");
    expect(updated?.processedAt).not.toBeNull();

    // Cleanup
    await db.webhookEvent.delete({ where: { stripeEventId: "evt_no_process" } });
  });
});
