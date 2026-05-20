import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { LeadStatus } from "@/domain/constants/statuses";
import { LEAD_STATUSES } from "@/domain/constants/statuses";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";

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
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  enforceWorkspaceId(validatedWorkspaceId, "createLead", "lead_record");

  const idempotencyKey = `lead-create:${input.companyName}:${userId}:${validatedWorkspaceId}`;

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
          createdBy: userId,
          status: "new",
          workspaceId: validatedWorkspaceId,
        },
      });
      return { id: lead.id, companyName: lead.companyName };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_CREATED,
    actorId: userId,
    entityType: "lead_record",
    entityId: result.result.id,
    workspaceId: validatedWorkspaceId,
      capability: 'mutation',
      decision: 'lead_created',
      requestId: randomUUID(),
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
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  enforceWorkspaceId(validatedWorkspaceId, "updateLead", "lead_record");

  const lead = await db.leadRecord.findUnique({ where: { id: leadId, workspaceId: validatedWorkspaceId } });
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

  await optimisticUpdate("lead_record", leadId, version, () =>
    db.leadRecord.update({
      where: withVersionCheck({ id: leadId, workspaceId: validatedWorkspaceId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_UPDATED,
    actorId: userId,
    entityType: "lead_record",
    entityId: leadId,
    workspaceId: validatedWorkspaceId,
    payload: data,
    visibility: 'internal',
  });

  logger.info("Lead updated", { leadId });
}

export async function linkLeadToEngagement(
  leadId: string,
  engagementId: string,
  clientId: string,
  actorId: string,
  workspaceId: string
): Promise<void> {
  enforceWorkspaceId(workspaceId, "linkLeadToEngagement", "lead_record");

  const lead = await db.leadRecord.findUnique({ where: { id: leadId, workspaceId } });
  if (!lead) throw new NotFoundError("LeadRecord", leadId);

  if (lead.status !== "qualified") {
    throw new ValidationError(
      "Lead must be in 'qualified' status to link to an engagement"
    );
  }

  if (lead.convertedToClientId) {
    // Already converted; check if it's to the same engagement (idempotency)
    if (lead.engagementId !== engagementId || lead.convertedToClientId !== clientId) {
      throw new ValidationError(
        "Lead is already converted to a different engagement or client"
      );
    }
    // Idempotent: already in desired state, no-op
    return;
  }

  // Validate that the engagement belongs to the specified client
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    select: { clientId: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);
  if (engagement.clientId !== clientId) {
    throw new ValidationError(
      "Engagement does not belong to the specified client"
    );
  }

  const idempotencyKey = `lead-link:${leadId}:${engagementId}:${clientId}:${workspaceId}`;

  await withIdempotency(
    idempotencyKey,
    "lead.link_to_engagement",
    async () => {
      await db.leadRecord.update({
        where: { id: leadId, workspaceId },
        data: {
          status: "converted",
          convertedToClientId: clientId,
          engagementId,
        },
      });
      return { id: leadId };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.LEAD_LINKED_TO_ENGAGEMENT,
    actorId,
    entityType: "lead_record",
    entityId: leadId,
    workspaceId,
    payload: { engagementId, clientId },
    visibility: "internal",
    capability: 'mutation',
    decision: 'l_e_a_d__l_i_n_k_e_d__t_o__e_n_g_a_g_e_m_e_n_t',
    requestId: randomUUID(),

  });

  // Lead conversion is significant client/engagement event
  await triggerReEvaluation({
    changeType: "new_critical_evidence",
    entityType: "lead_record",
    entityId: leadId,
    engagementId,
    workspaceId,
    severity: "medium",
    description: `Lead converted to client and linked to engagement ${engagementId}`,
    triggeredBy: actorId,
  });

  logger.info("Lead linked to engagement", { leadId, engagementId, clientId });
}

export async function getLeadById(leadId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getLeadById", "lead_record");

  const lead = await db.leadRecord.findUnique({
    where: { id: leadId, workspaceId },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, code: true, title: true } },
    },
  });
  if (!lead) throw new NotFoundError("LeadRecord", leadId);
  return lead;
}

export async function listLeads(workspaceId: string, params: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
} = {}) {
  enforceWorkspaceId(workspaceId, "listLeads", "lead_record");

  const { limit = 25, offset = 0, status, search } = params;

  const where = {
    workspaceId,
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
