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

// ─── Service ───────────────────────────────────────────────────────────────

export async function createContact(
  input: CreateContactInput,
  actorId: string
): Promise<{ id: string }> {
  const client = await db.clientAccount.findUnique({
    where: { id: input.clientId },
  });
  if (!client) throw new NotFoundError("ClientAccount", input.clientId);

  if (client.status === "archived") {
    throw new ValidationError("Cannot add contact to an archived client");
  }

  const idempotencyKey = `contact-create:${input.clientId}:${input.name}:${input.email ?? ""}:${actorId}`;

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

export async function deactivateContact(
  contactId: string,
  actorId: string
): Promise<void> {
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
    eventName: "contact.deactivated",
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

export async function getContactsForClient(clientId: string) {
  return db.clientContact.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}
