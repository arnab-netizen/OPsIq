import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

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
  actorId: string
): Promise<{ id: string }> {
  const client = await db.clientAccount.findUnique({
    where: { id: input.clientId },
  });
  if (!client) throw new NotFoundError("ClientAccount", input.clientId);

  const idempotencyKey = `contact-create:${input.clientId}:${input.name}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "client_contact.create",
    async () => {
      const contact = await db.clientContact.create({
        data: {
          clientId: input.clientId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          role: input.role ?? null,
          isPrimary: input.isPrimary ?? false,
          notes: input.notes ?? null,
        },
      });
      return { id: contact.id, name: contact.name };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_CONTACT_CREATED,
    actorId,
    entityType: "client_contact",
    entityId: result.result.id,
    payload: {
      clientId: input.clientId,
      name: result.result.name,
      role: input.role ?? null,
    },
    visibility: "internal",
  });

  logger.info("Client contact created", {
    contactId: result.result.id,
    clientId: input.clientId,
  });

  return { id: result.result.id };
}

export async function updateContact(
  contactId: string,
  input: UpdateContactInput,
  actorId: string
): Promise<void> {
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

export async function deactivateContact(
  contactId: string,
  actorId: string
): Promise<void> {
  const contact = await db.clientContact.findUnique({
    where: { id: contactId },
  });
  if (!contact) throw new NotFoundError("ClientContact", contactId);

  if (!contact.isActive) {
    throw new ValidationError("Contact is already inactive");
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
    visibility: "internal",
  });

  logger.info("Client contact deactivated", { contactId });
}

export async function getContactsForClient(clientId: string) {
  return db.clientContact.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}
