import { createHash } from "crypto";
import { logger } from "@/infra/logger";
import { OutcomeAuditInput, OutcomeAuditPacket } from "@/domain/outcome/audit";

export class OutcomeAuditor {
  /**
   * Create immutable audit packet with deterministic ID
   * Fail-closed: invalid input returns null (packet creation blocked)
   */
  createAuditPacket(input: OutcomeAuditInput): OutcomeAuditPacket | null {
    // Validate input
    if (!this.validateInput(input)) {
      logger.warn("Audit packet creation failed: invalid input", {
        workspace_id: input?.workspace_id,
        action_id: input?.action_id,
      });
      return null;
    }

    // Generate deterministic packet_id from input hash
    const packet_id = this.generateDeterministicId(input);

    // Create immutable packet
    const packet: OutcomeAuditPacket = {
      packet_id,
      action_id: input.action_id,
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
      baseline_metric: input.baseline_metric,
      actual_outcome: input.actual_outcome,
      variance: input.variance,
      variance_pct: input.variance_pct,
      confidence_before: input.before_confidence,
      confidence_after: input.after_confidence,
      feedback_action: input.feedback_action,
      measurement_quality: input.measurement_quality,
      outcome_date: new Date().toISOString(),
      auditable: true,
    };

    logger.info("Audit packet created", {
      packet_id,
      action_id: input.action_id,
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
      variance_pct: input.variance_pct,
    });

    return packet;
  }

  /**
   * Validate input for audit packet creation
   */
  private validateInput(input: OutcomeAuditInput): boolean {
    if (!input) return false;
    if (!input.action_id || !input.decision_id || !input.workspace_id) return false;
    if (!input.baseline_metric || !input.actual_outcome) return false;
    if (input.before_confidence < 0 || input.before_confidence > 100) return false;
    if (input.after_confidence < 0 || input.after_confidence > 100) return false;
    if (!input.feedback_action) return false;
    if (!input.measurement_quality) return false;
    return true;
  }

  /**
   * Generate deterministic packet ID from input
   * Same input always produces same packet_id (idempotency)
   */
  private generateDeterministicId(input: OutcomeAuditInput): string {
    // Create hash from key fields to ensure idempotency
    const contentHash = createHash("sha256")
      .update(input.action_id)
      .update(input.decision_id)
      .update(input.workspace_id)
      .update(JSON.stringify(input.baseline_metric))
      .update(JSON.stringify(input.actual_outcome))
      .update(input.variance.toString())
      .update(input.variance_pct.toString())
      .update(input.before_confidence.toString())
      .update(input.after_confidence.toString())
      .digest("hex");

    // Convert first 32 chars of hash to UUID-like format
    // Format: 8-4-4-4-12
    const hex = contentHash.substring(0, 32);
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32),
    ].join("-");
  }

  /**
   * Check if packet is auditable (immutable)
   */
  isAuditable(packet: OutcomeAuditPacket): boolean {
    return packet.auditable === true;
  }

  /**
   * Get packet summary for display
   */
  getPacketSummary(packet: OutcomeAuditPacket): string {
    return (
      `Outcome: action=${packet.action_id.substring(0, 8)}, ` +
      `variance=${packet.variance_pct > 0 ? "+" : ""}${packet.variance_pct.toFixed(1)}%, ` +
      `confidence=${packet.confidence_before.toFixed(0)}% → ${packet.confidence_after.toFixed(0)}%, ` +
      `action=${packet.feedback_action}`
    );
  }

  /**
   * Verify packet immutability (cannot be modified after creation)
   */
  verifyImmutability(original: OutcomeAuditPacket, modified: OutcomeAuditPacket): boolean {
    // packet_id must remain the same (idempotency marker)
    if (original.packet_id !== modified.packet_id) return false;
    // Key data fields must not change
    if (original.action_id !== modified.action_id) return false;
    if (original.decision_id !== modified.decision_id) return false;
    if (original.workspace_id !== modified.workspace_id) return false;
    if (original.variance !== modified.variance) return false;
    if (original.variance_pct !== modified.variance_pct) return false;
    // auditable must remain true
    if (modified.auditable !== true) return false;
    return true;
  }
}

export const outcomeAuditor = new OutcomeAuditor();
