/**
 * Bundle 5.2 — Owner Connector Registry API surface.
 *
 * GET  /api/owner/connectors                — list connectors (?status=ACTIVE|...)
 * GET  /api/owner/connectors?id=...         — get connector by id
 * GET  /api/owner/connectors?id=...&health=1 — get connector health report
 * POST /api/owner/connectors               — register connector (idempotent)
 * PATCH /api/owner/connectors              — lifecycle transitions (disconnect | activate | mark_refresh_failed)
 *
 * Auth: INTEGRATION_MANAGE. Workspace-scoped. No token values in any response.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { CONNECTOR_PROVIDERS, CONNECTOR_STATUSES } from "@/domain/integration-fabric/integration-contracts";
import {
  registerConnector,
  disconnectConnector,
  activateConnector,
  markConnectorRefreshFailed,
  listConnectors,
  getConnector,
  getConnectorHealth,
} from "@/services/integration-fabric/connector-registry.service";
import type { ConnectorStatus } from "@/domain/integration-fabric/integration-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerSchema = z.object({
  provider: z.enum(CONNECTOR_PROVIDERS),
  businessId: z.string().uuid().optional(),
  tokenExpiresAt: z.string().datetime().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("disconnect"),
    connectorId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("activate"),
    connectorId: z.string().uuid(),
    tokenExpiresAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("mark_refresh_failed"),
    connectorId: z.string().uuid(),
    failureMessage: z.string().trim().min(1).max(500),
  }),
]);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const id = url.searchParams.get("id");
    const health = url.searchParams.get("health");
    const status = url.searchParams.get("status");

    if (id && (health === "1" || health === "true")) {
      const report = await getConnectorHealth({ workspaceId: ctx.verifiedWorkspaceId, connectorId: id });
      return canonicalJson({ health: report }, { status: 200 });
    }

    if (id) {
      const dto = await getConnector({ workspaceId: ctx.verifiedWorkspaceId, connectorId: id });
      return canonicalJson({ connector: dto }, { status: 200 });
    }

    const validStatus = status && (CONNECTOR_STATUSES as readonly string[]).includes(status)
      ? (status as ConnectorStatus)
      : undefined;

    const connectors = await listConnectors({
      workspaceId: ctx.verifiedWorkspaceId,
      status: validStatus,
    });
    return canonicalJson({ connectors }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.INTEGRATION_MANAGE], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, registerSchema);
    const dto = await registerConnector({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      provider: input.provider,
      businessId: input.businessId,
      tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : undefined,
    });
    return canonicalJson({ connector: dto }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.INTEGRATION_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);

    if (input.action === "disconnect") {
      const dto = await disconnectConnector({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        connectorId: input.connectorId,
      });
      return canonicalJson({ connector: dto }, { status: 200 });
    }

    if (input.action === "activate") {
      const dto = await activateConnector({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        connectorId: input.connectorId,
        tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : undefined,
      });
      return canonicalJson({ connector: dto }, { status: 200 });
    }

    const dto = await markConnectorRefreshFailed({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      connectorId: input.connectorId,
      failureMessage: input.failureMessage,
    });
    return canonicalJson({ connector: dto }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.INTEGRATION_MANAGE], requireWorkspace: true }
);
