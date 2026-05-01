import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { generateReport } from "@/services/report/engine";

export const GET = withRequestContext(async (request) => {
  try {
    // Authenticate + authorize (fail-closed)
    await withAuth();

    const report = await generateReport();
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
});
