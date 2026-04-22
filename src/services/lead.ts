import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { LeadStatus } from "@/domain/constants/statuses";
import { LEAD_STATUSES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateLeadInput {
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  source?: string;
  notes?: string;
  estimatedValue?: number;
  assignedTo?: string;
}

export interface UpdateLeadInput {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  source?: string;
  notes?: string;
  estimatedValue?: number;
  status?: LeadStatus;
  assignedTo?: string;
  version: number;
}

// ─── Transition Map ────────────────────────────────────────────────────────

const LEAD_TRANSITIONS: Partial<Record<LeadStatus, readonly LeadStatus[]>> = {
  new: ["qualifying", "lost"],
  qualifying: ["qualified", "lost"],
  qualified: ["converted", "lost"],
  converted: [],
  lost: ["new"],
};

function validateLeadTransition(from: LeadStatus, to: LeadStatus): void {
  const allowed = LEAD_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ValidationError(
      `Invalid lead status transition: ${from} → ${to}`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createLead(
  input: CreateLeadInput,
  actorId: string
): Promise<{ id: string }> {
  const idempotencyKey = `lead-create:${input.companyName}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "lead.create",
    async () => {
      const lead = await db.leadRecord.create({
        data: {
          companyName: input.companyName,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          source: input.source ?? null,
          notes: input.notes ?? null,
          estimatedValue: input.estimatedValue ?? null,
          assignedTo: input.assignedTo ?? null,
          createdBy: actorId,
          status: "new",
        },
      });
      return { id: lead.id, companyName: lead.companyName };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_CREATED,
    actorId,
    entityType: "lead_record",
    entityId: result.result.id,
    payload: { companyName: result.result.companyName },
    visibility: "internal",
  });

  logger.info("Lead created", {
    leadId: result.result.id,
    companyName: result.result.companyName,
  });

  return { id: result.result.id };
}

export async function updateLead(
  leadId: string,
  input: UpdateLeadInput,
  actorId: string
): Promise<void> {
  const lead = await db.leadRecord.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("LeadRecord", leadId);

  if (lead.status === "converted") {
    throw new ValidationError("Cannot update a converted lead");
  }

  if (input.status && input.status !== lead.status) {
    validateLeadTransition(lead.status as LeadStatus, input.status);
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) data[k] = v;
  }

  // Duplicate request protection: optimistic locking via version check
  // Duplicate requests with old version fail fast with 409 Conflict
  await optimisticUpdate("lead_record", leadId, version, () =>
    db.leadRecord.update({
      where: withVersionCheck({ id: leadId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_UPDATED,
    actorId,
    entityType: "lead_record",
    entityId: leadId,
    payload: data,
    visibility: "internal",
  });

  logger.info("Lead updated", { leadId });
}

export async function linkLeadToEngagement(
  leadId: string,
  engagementId: string,
  clientId: string,
  actorId: string
): Promise<void> {
  const lead = await db.leadRecord.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("LeadRecord", leadId);

  if (lead.status !== "qualified") {
    throw new ValidationError(
      "Lead must be in 'qualified' status to link to an engagement"
    );
  }

  // Verify engagement exists and belongs to the specified client
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true, clientId: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  // Validate client exists and is not archived
  const client = await db.clientAccount.findUnique({
    where: { id: clientId },
    select: { id: true, status: true },
  });
  if (!client) throw new NotFoundError("ClientAccount", clientId);
  if (client.status === "archived") {
    throw new ValidationError("Cannot link lead to an archived client");
  }

  // Verify engagement belongs to the provided client
  if (engagement.clientId !== clientId) {
    throw new ValidationError(
      "Engagement does not belong to the specified client"
    );
  }

  const idempotencyKey = `lead-convert:${leadId}:${engagementId}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "lead.link_to_engagement",
    async () => {
      await db.leadRecord.update({
        where: { id: leadId },
        data: {
          status: "converted",
          convertedToClientId: clientId,
          engagementId,
        },
      });
      return { leadId, engagementId, clientId };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_LINKED_TO_ENGAGEMENT,
    actorId,
    entityType: "lead_record",
    entityId: leadId,
    payload: { engagementId, clientId },
    visibility: "internal",
  });

  // Trigger re-evaluation: lead conversion is a scope change that may affect engagement planning
  await triggerReEvaluation({
    changeType: "scope_change",
    entityType: "lead_record",
    entityId: leadId,
    engagementId,
    severity: "medium",
    description: `Lead ${leadId} converted and linked to engagement ${engagementId}`,
    triggeredBy: actorId,
  });

  logger.info("Lead linked to engagement", {
    leadId,
    engagementId,
    clientId,
  });
}

export async function getLeadById(leadId: string) {
  const lead = await db.leadRecord.findUnique({
    where: { id: leadId },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, code: true, title: true } },
    },
  });
  if (!lead) throw new NotFoundError("LeadRecord", leadId);
  return lead;
}

export async function listLeads(params: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
} = {}) {
  const { limit = 25, offset = 0, status, search } = params;

  const where = {
    ...(status && { status }),
    ...(search && {
      companyName: { contains: search, mode: "insensitive" as const },
    }),
  };

  const [leads, total] = await Promise.all([
    db.leadRecord.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        status: true,
        source: true,
        estimatedValue: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.leadRecord.count({ where }),
  ]);

  return { leads, total, limit, offset };
}
