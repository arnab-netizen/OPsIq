/**
 * Internal startup orchestration endpoint
 * Called automatically on first meaningful request to ensure startup checks run
 */

import { ensureStartupComplete } from "@/infra/startup-orchestrator";
import { isStartupComplete, getStartupError } from "@/infra/startup-state";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    // Run startup checks if not already done
    if (!isStartupComplete()) {
      await ensureStartupComplete();
    }

    return Response.json(
      { startup_complete: true },
      { status: 200 }
    );
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'load' });
    return Response.json(
      { startup_complete: false, error: governed.operatorMessage },
      { status: 503 }
    );
  }
}
