/**
 * CRITICAL SERVICE API: Authentication & Authorization
 *
 * Phase 0 contract: All auth operations return ServiceResult<T> with canonical errors.
 * Policy/auth failures fail closed, canonical error types only.
 */

import type { ServiceResult } from "@/contracts";
import type { SessionInfo, PolicyContext, AuthContext } from "@/contracts";
import {
  getSession as getSessionInternal,
  requireSession as requireSessionInternal,
  getPolicyContext as getPolicyContextInternal,
} from "./auth";
import {
  getServerAuthContext as getAuthContextInternal,
} from "@/lib/auth-guard";
import { wrapServiceCall } from "./service-result-helper";

/**
 * Get session with deterministic ServiceResult<T> contract.
 * Returns null data if no valid session (not an error).
 */
export async function getSessionAPI(
  workspaceId?: string
): Promise<ServiceResult<SessionInfo | null>> {
  return wrapServiceCall(async () => {
    return await getSessionInternal(workspaceId);
  });
}

/**
 * Require session with deterministic ServiceResult<T> contract.
 * Fails closed on auth errors (returns AUTH_ERROR on missing/invalid session).
 */
export async function requireSessionAPI(
  workspaceId?: string
): Promise<ServiceResult<SessionInfo>> {
  return wrapServiceCall(async () => {
    return await requireSessionInternal(workspaceId);
  });
}

/**
 * Get policy context with deterministic ServiceResult<T> contract.
 * Returns null data if no valid session (not an error).
 */
export async function getPolicyContextAPI(
  workspaceId?: string
): Promise<ServiceResult<PolicyContext | null>> {
  return wrapServiceCall(async () => {
    return await getPolicyContextInternal(workspaceId);
  });
}

/**
 * Get auth context with deterministic ServiceResult<T> contract.
 * Combines session + policy context with canonical error handling.
 * Fails closed on auth/policy errors.
 * Returns null if no valid session (not an error).
 */
export async function getAuthContextAPI(
  workspaceId?: string
): Promise<ServiceResult<AuthContext | null>> {
  return wrapServiceCall(async () => {
    return await getAuthContextInternal(workspaceId);
  });
}
