import { NextRequest, NextResponse } from "next/server";
import { getQueuedItems } from "@/services/operator/store";
import { resolveServerRole } from "@/services/auth/server-role";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

export async function GET(request: NextRequest) {
  try {
    // Enforce server-side auth (fail-closed)
    const role = await resolveServerRole();
    if (!role) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: "Invalid limit: must be between 1 and 1000" },
        { status: 400 }
      );
    }

    // Fetch queued items
    const items = await getQueuedItems(status, limit);

    // Get actor ID for audit
    const session = await getSession();
    const actorId = session?.user.id ?? null;

    // Emit audit event
    await logAuditEvent({
      eventName: "QUEUE_VIEWED",
      entityType: "OperatorQueue",
      entityId: "queue",
      actorId,
      role,
      before: null,
      after: {
        itemCount: items.length,
        status,
        limit,
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
