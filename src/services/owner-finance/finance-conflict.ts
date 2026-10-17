import { ConflictError } from "@/infra/errors";
import type { FinanceConflictCode } from "@/domain/owner-finance/snapshot-conflict";

/**
 * A 409 that carries MACHINE fields (`code` plus the identity of the snapshot involved), so the owner's screen can offer the
 * right next step — update the period that already exists, or review the latest figures — instead of parsing prose. Routes
 * send `responseBody` (the safe text under `error`, then the machine fields) with status 409. Still a `ConflictError`, so
 * every existing `instanceof ConflictError` / 409 contract holds.
 */
export class FinanceConflictError extends ConflictError {
  readonly body: { code: FinanceConflictCode } & Record<string, unknown>;
  constructor(code: FinanceConflictCode, message: string, fields: Record<string, unknown>) {
    super(message, { code, ...fields });
    this.body = { code, ...fields };
    this.name = "FinanceConflictError";
  }

  get responseBody(): Record<string, unknown> {
    return { error: this.message, ...this.body };
  }
}
