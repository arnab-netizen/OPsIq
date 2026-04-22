import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ConflictError, ValidationError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateClientInput {
  name: string;
  legalName?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: string;
  notes?: string;
}

export interface UpdateClientInput {
  name?: string;
  legalName?: string;
  industry?: string;
  size?: string;
  website?: string;
  address?: string;
  notes?: string;
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createClient(
  input: CreateClientInput,
  actorId: string
): Promise<{ id: string }> {
  const idempotencyKey = `client-create:${input.name}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "client_account.create",
    async () => {
      const client = await db.clientAccount.create({
        data: {
          name: input.name,
          legalName: input.legalName ?? null,
          industry: input.industry ?? null,
          size: input.size ?? null,
          website: input.website ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          createdBy: actorId,
        },
      });
      return { id: client.id, name: client.name };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_ACCOUNT_CREATED,
    actorId,
    entityType: "client_account",
    entityId: result.result.id,
    payload: { name: result.result.name },
    visibility: "internal",
  });

  logger.info("Client account created", {
    clientId: result.result.id,
    name: result.result.name,
  });

  return { id: result.result.id };
}

export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
  actorId: string
): Promise<void> {
  const client = await db.clientAccount.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new NotFoundError("ClientAccount", clientId);
  if (client.status === "archived") {
    throw new ValidationError("Cannot update an archived client");
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) data[k] = v;
  }

  await optimisticUpdate("client_account", clientId, version, () =>
    db.clientAccount.update({
      where: withVersionCheck({ id: clientId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_ACCOUNT_UPDATED,
    actorId,
    entityType: "client_account",
    entityId: clientId,
    payload: data,
    visibility: "internal",
  });

  logger.info("Client account updated", { clientId });
}

export async function archiveClient(
  clientId: string,
  actorId: string,
  version: number
): Promise<void> {
  const client = await db.clientAccount.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new NotFoundError("ClientAccount", clientId);
  if (client.status === "archived") {
    throw new ValidationError("Client is already archived");
  }

  await optimisticUpdate("client_account", clientId, version, () =>
    db.clientAccount.update({
      where: withVersionCheck({ id: clientId }, version),
      data: withVersionIncrement({
        status: "archived",
        archivedAt: new Date(),
      }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_ACCOUNT_ARCHIVED,
    actorId,
    entityType: "client_account",
    entityId: clientId,
    visibility: "internal",
  });

  logger.info("Client account archived", { clientId });
}

export async function getClientById(clientId: string, hasInternalAccess: boolean = false) {
  const visibilityFilter = hasInternalAccess ? { visibility: { in: ["internal", "client_visible"] } } : { visibility: "client_visible" };

  const client = await db.clientAccount.findUnique({
    where: { id: clientId },
    include: {
      contacts: { where: { isActive: true }, orderBy: { isPrimary: "desc" } },
      _count: { select: { engagements: true } },
    },
  });

  if (!client) throw new NotFoundError("ClientAccount", clientId);
  if (!hasInternalAccess && client.visibility !== "client_visible") {
    throw new NotFoundError("ClientAccount", clientId);
  }

  return client;
}

export async function listClients(
  params: {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
  } = {},
  hasInternalAccess: boolean = false
) {
  const { limit = 25, offset = 0, status, search } = params;

  const visibilityFilter = hasInternalAccess ? { visibility: { in: ["internal", "client_visible"] } } : { visibility: "client_visible" };

  const where = {
    ...visibilityFilter,
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { legalName: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [clients, total] = await Promise.all([
    db.clientAccount.findMany({
      where,
      select: {
        id: true,
        name: true,
        industry: true,
        status: true,
        createdAt: true,
        _count: { select: { engagements: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.clientAccount.count({ where }),
  ]);

  return { clients, total, limit, offset };
}
