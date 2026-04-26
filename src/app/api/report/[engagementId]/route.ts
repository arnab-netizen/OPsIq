import { withRequestContext } from "../../../lib/api-handler.js";
import { withAuth } from "../../../lib/auth-guard.js";
import { CAPABILITIES } from "../../../domain/constants/capabilities.js";
import { generateReport } from "../../../services/report-generator.js";

export const GET = withRequestContext(async (request, { params }) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_READ,
  });

  const engagementId = params.engagementId;

  try {
    const report = await generateReport(engagementId, session.user.id);

    return Response.json(
      {
        success: true,
        report,
        validation: {
          allSectionsPresent: true,
          standardized: true,
          dataSourced: true,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("REPORT VALIDATION")) {
      return Response.json(
        {
          success: false,
          error: error.message,
          validation: {
            allSectionsPresent: false,
            standardized: false,
          },
        },
        { status: 400 }
      );
    }
    throw error;
  }
});
