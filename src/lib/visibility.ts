import { db } from "@/lib/db";
import { ForbiddenError } from "@/infra/errors";

export async function assertEngagementAccess(
  userId: string,
  engagementId: string
): Promise<void> {
  const membership = await db.engagementMembership.findFirst({
    where: {
      userId,
      engagementId,
      isActive: true,
    },
  });

  if (!membership) {
    throw new ForbiddenError(
      `User does not have access to engagement: ${engagementId}`
    );
  }
}
