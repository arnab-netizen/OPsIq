import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { executeWorkflow } from "@/services/execute";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";

const executeSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  problem: z.string().min(1, "Problem statement is required"),
  findings: z.array(z.string().min(1)).min(1, "At least one finding is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const body = await parseRequestBody(request, executeSchema);
  const result = await executeWorkflow(body, session.user.id, workspaceId);

  return Response.json(result, { status: 200 });
});
