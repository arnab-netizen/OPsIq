import { isPublicBetaEnabled } from "@/lib/beta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tells the signup UI whether public registration is currently open.
 *
 * This is display-only — it exists so the /signup page can show "beta
 * registration closed" instead of a blank/broken form. It carries no
 * authority: POST /api/auth/signup independently re-checks
 * isPublicBetaEnabled() itself on every request, so a client cannot spoof
 * this endpoint's response (or skip calling it, or cache a stale "enabled")
 * to open a registration window the server has actually closed.
 */
export const GET = async () => {
  return Response.json({ enabled: isPublicBetaEnabled() });
};
