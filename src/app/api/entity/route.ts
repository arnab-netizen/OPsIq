import { NextRequest, NextResponse } from "next/server";
import { createEntity, getEntities } from "@/services/entity/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { canEdit } from "@/services/auth/access";
import { logAuditEvent } from "@/services/audit/audit-log";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const entities = getEntities();
    return NextResponse.json(entities);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Enforce server-side auth
    const role = await resolveServerRole();
    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (!canEdit(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name, type" },
        { status: 400 }
      );
    }

    const validTypes = ["business_unit", "client", "project"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid type: must be business_unit, client, or project" },
        { status: 400 }
      );
    }

    const entityId = randomUUID();
    const entity = {
      id: entityId,
      name,
      type,
      createdAt: new Date().toISOString(),
    };

    // Get actor ID for audit
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    createEntity(entity);

    // Log audit event (fail-closed if audit fails)
    await logAuditEvent({
      eventName: "CREATE",
      entityType: "Entity",
      entityId,
      actorId,
      role,
      before: null,
      after: entity,
    });

    return NextResponse.json(entity);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
