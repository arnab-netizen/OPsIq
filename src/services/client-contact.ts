import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import type { AuthContext } from "@/lib/auth-guard";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateContactInput {
  clientId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface UpdateContactInput {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
  notes?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createContact(
  input: CreateContactInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<{ id: string }> {
  if (!workspaceId) throw new Error("workspaceId is required");
  const actorId = authContext.session.user.id;
  const client = await db.clientAccount.findUnique({
    where: { id: input.clientId },
  });
  if (!client) throw new NotFoundError("ClientAccount", input.clientId);

  const contact = await db.clientContact.create({
    data: {
      clientId: input.clientId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes ?? null,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_CONTACT_CREATED,
    actorId,
    entityType: "client_contact",
    entityId: contact.id,
    payload: {
      clientId: input.clientId,
      name: contact.name,
      role: input.role ?? null,
    },
    visibility: "internal",
  });

  logger.info("Client contact created", {
    contactId: contact.id,
    clientId: input.clientId,
  });

  return { id: contact.id };
}

export async function deactivateContact(
  contactId: string,
  authContext: AuthContext,
  workspaceId: string
): Promise<void> {
  if (!workspaceId) throw new Error("workspaceId is required");
  const actorId = authContext.session.user.id;
  const contact = await db.clientContact.findUnique({
    where: { id: contactId },
  });
  if (!contact) throw new NotFoundError("ClientContact", contactId);

  // Idempotent: if already inactive, return success (duplicate request protection)
  if (!contact.isActive) {
    logger.info("Contact already deactivated, returning success", { contactId });
    return;
  }

  await db.clientContact.update({
    where: { id: contactId },
    data: { isActive: false },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_CONTACT_DEACTIVATED,
    actorId,
    entityType: "client_contact",
    entityId: contactId,
    payload: { clientId: contact.clientId },
    visibility: "internal",
  });

  logger.info("Client contact deactivated", {
    contactId,
    clientId: contact.clientId,
  });
}

export async function updateContact(
  contactId: string,
  input: UpdateContactInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<void> {
  if (!workspaceId) throw new Error("workspaceId is required");
  const actorId = authContext.session.user.id;
  const contact = await db.clientContact.findUnique({
    where: { id: contactId },
  });
  if (!contact) throw new NotFoundError("ClientContact", contactId);

  if (!contact.isActive) {
    throw new ValidationError("Cannot update an inactive contact");
  }

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) data[k] = v;
  }

  await db.clientContact.update({
    where: { id: contactId },
    data,
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_CONTACT_UPDATED,
    actorId,
    entityType: "client_contact",
    entityId: contactId,
    payload: data,
    visibility: "internal",
  });

  logger.info("Client contact updated", { contactId });
}


export async function getContactsForClient(clientId: string) {
  return db.clientContact.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}
