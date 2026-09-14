/**
 * Beta capacity operator alerts — 80%/100% threshold crossing only.
 *
 * NOT a notification platform: reuses the existing email provider +
 * BETA_REQUEST_NOTIFICATION_EMAIL (same recipient/plumbing as the beta
 * request owner notifications), and tracks exactly one piece of state, the
 * CURRENT tier (0 | 80 | 100), in the CapacityAlertState singleton.
 *
 * Tier-reset semantics (capacity is an admissions ledger — see
 * platform-settings.service.ts — so utilization can only go DOWN via an
 * operator raising the capacity limit, never via suspension/disable):
 *   - crossed > lastThresholdSent: send once, advance the tier.
 *   - crossed < lastThresholdSent: silently reset the tier down, no alert.
 *   - crossed === lastThresholdSent: no-op.
 * A later re-crossing of a threshold the state was reset below fires again,
 * because the stored tier genuinely reflects "currently above this line",
 * not "ever crossed this line."
 *
 * Race safety: the state transition uses a conditional updateMany guarded on
 * the previously-read lastThresholdSent (same optimistic-lock idiom as
 * deactivateUser/employee-lifecycle) — only the caller whose conditional
 * update actually matches sends the email, so two callers racing the same
 * crossing can't both alert. Not lock-protected against every conceivable
 * interleaving (no advisory lock here — alerting is best-effort, not a
 * correctness-critical gate like capacity itself), which is an accepted,
 * documented tradeoff for a notification, not an admission decision.
 *
 * Never throws: a failure anywhere in this function (state write, email
 * send, or the capacity/settings read itself) must never corrupt or block
 * the signup/capacity-update call path that triggered the check — see
 * callers in signup/route.ts and platform-settings.service.ts.
 */
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { readEffectiveSettings, countExternalBetaWorkspaces } from "@/services/beta/platform-settings.service";

type Tier = 0 | 80 | 100;

function computeTier(count: number, capacityLimit: number): Tier {
  if (capacityLimit <= 0) return 100;
  const pct = count / capacityLimit;
  if (pct >= 1) return 100;
  if (pct >= 0.8) return 80;
  return 0;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2002";
}

/**
 * Returns true only for the single caller that should actually send the
 * alert email for this crossing (race-guarded transition; see module doc).
 */
async function transitionAlertTier(crossed: Tier): Promise<boolean> {
  const state = await db.capacityAlertState.findUnique({ where: { id: "global" } });
  if (!state) {
    try {
      await db.capacityAlertState.create({
        data: { id: "global", lastThresholdSent: crossed, sentAt: crossed > 0 ? new Date() : null },
      });
      return crossed > 0;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false; // another caller created it first
      throw error;
    }
  }

  if (crossed === state.lastThresholdSent) return false;

  const updated = await db.capacityAlertState.updateMany({
    where: { id: "global", lastThresholdSent: state.lastThresholdSent },
    data: {
      lastThresholdSent: crossed,
      sentAt: crossed > state.lastThresholdSent ? new Date() : state.sentAt,
    },
  });
  return updated.count === 1 && crossed > state.lastThresholdSent;
}

async function sendCapacityAlertEmail(tier: Tier, count: number, capacityLimit: number): Promise<void> {
  const recipient = process.env.BETA_REQUEST_NOTIFICATION_EMAIL;
  if (!recipient) return;
  const provider = getEmailProvider();
  if (!provider) return;
  await provider.send({
    to: recipient,
    subject: `OpsIQ beta capacity at ${tier}%`,
    html: `<p>Beta cohort usage has reached <strong>${tier}%</strong> (${count} / ${capacityLimit}).</p>`,
    text: `Beta cohort usage has reached ${tier}% (${count} / ${capacityLimit}).`,
  });
}

/** Call after any capacity-affecting event (successful signup, capacity-limit change). Never throws. */
export async function checkAndSendCapacityAlert(): Promise<void> {
  try {
    const settings = await readEffectiveSettings();
    const count = await countExternalBetaWorkspaces();
    const crossed = computeTier(count, settings.capacityLimit);

    const shouldAlert = await transitionAlertTier(crossed);
    if (!shouldAlert) return;

    try {
      await sendCapacityAlertEmail(crossed, count, settings.capacityLimit);
    } catch (emailError) {
      logger.warn("Capacity alert email dispatch failed", {
        errorType: emailError instanceof Error ? emailError.constructor.name : "UnknownError",
      });
    }

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.PLATFORM_CAPACITY_ALERT_SENT,
      actorType: "system",
      entityType: "platform_setting",
      entityId: "global",
      payload: { tier: crossed, count, capacityLimit: settings.capacityLimit },
      visibility: "internal",
    });
  } catch (error) {
    logger.warn("Capacity alert check failed (non-blocking)", {
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
    });
  }
}
