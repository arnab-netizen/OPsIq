/**
 * Product funnel recorder. Events are written through the existing audit infrastructure (tenant-scoped and
 * hash-chained when a workspace is known, explicitly unchained otherwise) with a sanitised, allow-listed
 * payload. Recording NEVER throws into the caller: analytics must not break a first-run mutation.
 */
import { emitAuditEvent } from "@/infra/audit";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  PRODUCT_EVENTS,
  sanitiseProductEventProps,
  type ProductEventName,
} from "@/domain/analytics/product-events";

export interface RecordProductEventInput {
  name: ProductEventName;
  workspaceId?: string;
  actorId?: string;
  businessId?: string;
  props?: Record<string, unknown>;
  correlationId?: string;
}

export async function recordProductEvent(input: RecordProductEventInput): Promise<void> {
  try {
    await emitAuditEvent({
      eventName: PRODUCT_EVENTS[input.name],
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      entityType: input.businessId ? "OwnerBusiness" : undefined,
      entityId: input.businessId,
      payload: sanitiseProductEventProps(input.props),
      correlationId: input.correlationId,
      visibility: "internal",
    });
  } catch (error) {
    logger.warn("product event not recorded", undefined, {
      event: input.name,
      error: classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" }).technicalDetails,
    });
  }
}
