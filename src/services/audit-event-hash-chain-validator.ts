import crypto from 'crypto';

/**
 * AuditEventHashChainValidator: Validate audit event hash chain integrity
 * Ensures audit events form an immutable chain where each event's hash includes the previous event's hash
 */
export class AuditEventHashChainValidator {
  /**
   * Validate hash chain for a sequence of audit events
   * Returns true if chain is valid, throws if corruption detected
   */
  static validateChain(events: Array<{
    id: string;
    previousHash: string | null;
    hash: string;
    eventType: string;
    payload: Record<string, unknown>;
    recordedAt: Date;
  }>): boolean {
    if (events.length === 0) {
      return true;
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // First event must have null previousHash
      if (i === 0) {
        if (event.previousHash !== null) {
          throw new Error(
            `AuditEventHashChainValidator: First event (id: ${event.id}) must have null previousHash`
          );
        }
      } else {
        // Subsequent events must reference previous event's hash
        const prevEvent = events[i - 1];
        if (event.previousHash !== prevEvent.hash) {
          throw new Error(
            `AuditEventHashChainValidator: Chain broken at event ${i} (id: ${event.id}). ` +
            `Expected previousHash=${prevEvent.hash}, got ${event.previousHash}`
          );
        }
      }

      // Validate event's own hash
      const expectedHash = this.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      if (event.hash !== expectedHash) {
        throw new Error(
          `AuditEventHashChainValidator: Hash mismatch at event (id: ${event.id}). ` +
          `Expected ${expectedHash}, got ${event.hash}. Event corrupted.`
        );
      }
    }

    return true;
  }

  /**
   * Compute hash for an audit event
   * Hash includes: previousHash, eventType, payload, recordedAt
   */
  static computeHash(
    previousHash: string | null,
    eventType: string,
    payload: Record<string, unknown>,
    recordedAt: Date
  ): string {
    const dataToHash = JSON.stringify({
      previousHash,
      eventType,
      payload,
      recordedAt: recordedAt.toISOString(),
    });

    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  /**
   * Validate single event hash (for real-time validation during insert)
   */
  static validateEventHash(event: {
    previousHash: string | null;
    hash: string;
    eventType: string;
    payload: Record<string, unknown>;
    recordedAt: Date;
  }): boolean {
    const expectedHash = this.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    if (event.hash !== expectedHash) {
      throw new Error(
        `AuditEventHashChainValidator: Hash validation failed. ` +
        `Expected ${expectedHash}, got ${event.hash}`
      );
    }

    return true;
  }
}
