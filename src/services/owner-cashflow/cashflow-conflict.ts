import { ConflictError } from "@/infra/errors";
import type { CashflowConflictCode } from "@/domain/owner-cashflow/amend";

/**
 * A 409 that carries MACHINE fields (`code` plus the entry's identity / current values), so the owner's screen can offer
 * the right next step (open the existing entry, reload fresh values, confirm a replacement) instead of parsing prose.
 * Routes send `responseBody` (the owner-safe text plus the machine fields) with status 409.
 */
export class CashflowConflictError extends ConflictError {
  readonly body: { code: CashflowConflictCode } & Record<string, unknown>;
  constructor(code: CashflowConflictCode, message: string, fields: Record<string, unknown>) {
    super(message, { code, ...fields });
    this.body = { code, ...fields };
    this.name = "CashflowConflictError";
  }

  /** The JSON a route answers with: the owner-safe text under `error`, then the machine fields. */
  get responseBody(): Record<string, unknown> {
    const text = this.message;
    return { error: text, ...this.body };
  }
}
