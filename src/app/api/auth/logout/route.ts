import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();

  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete("session");

  return Response.json({
    success: true,
    message: "Logged out successfully",
  });
});
