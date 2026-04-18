import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createEvidenceItem,
  uploadFileEvidence,
  listEvidenceForEngagement,
} from "@/services/evidence";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import {
  createEvidenceItemSchema,
  uploadFileEvidenceSchema,
  listEvidenceSchema,
} from "@/domain/validation/evidence";
import { errorToResponse } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const POST = withRequestContext(async (request) => {
  try {
    const { session } = await withAuth({
      capability: CAPABILITIES.EVIDENCE_SUBMIT,
    });

    const contentType = request.headers.get("content-type");

    if (contentType?.includes("multipart/form-data")) {
      // File upload path
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message: "File is required" } },
          { status: 400 }
        );
      }

      const fileBuffer = await file.arrayBuffer();
      const storageKey = `evidence/${Date.now()}-${file.name}`;

      const metadata = Object.fromEntries(
        Array.from(formData.entries()).filter(([k]) => k !== "file")
      );

      const body = {
        ...metadata,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: fileBuffer.byteLength,
      };

      const input = uploadFileEvidenceSchema.parse(body);
      const result = await uploadFileEvidence(input, storageKey, session.user.id);

      return Response.json(result, { status: 201 });
    } else {
      // Structured evidence path
      const body = await parseRequestBody(request, createEvidenceItemSchema);
      const result = await createEvidenceItem(body, session.user.id);

      return Response.json(result, { status: 201 });
    }
  } catch (error) {
    logger.error("Error creating evidence", { error });
    return errorToResponse(error);
  }
});

export const GET = withRequestContext(async (request) => {
  try {
    await withAuth({
      capability: CAPABILITIES.EVIDENCE_VIEW,
    });

    const params = parseSearchParams(request.url, listEvidenceSchema);
    const result = await listEvidenceForEngagement(params);

    return Response.json(result);
  } catch (error) {
    logger.error("Error listing evidence", { error });
    return errorToResponse(error);
  }
});
