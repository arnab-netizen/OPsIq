/**
 * Thin transport for the owner outcome timeline. No rules, no derivation: every call goes to an EXISTING (or the one
 * read-only list) route, always scoped by the business id in the path; the server resolves workspace, candidate and
 * every conclusion. Failures surface as `HttpResponseError` (status + governed message + field errors).
 */
import { toHttpResponseError } from "@/lib/operator-safe-errors";
import type { OwnerDecisionRecordDto, OwnerOutcomeAssessmentDto, OwnerOutcomeChainDto } from "@/domain/owner-spine/owner-outcome-presentation";

const base = (businessId: string): string => `/api/owner/businesses/${encodeURIComponent(businessId)}`;

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw await toHttpResponseError(res);
  return (await res.json()) as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export interface ChainListResponse { businessId: string; chains: OwnerOutcomeChainDto[]; truncated: boolean }

export async function fetchOutcomeChains(businessId: string, signal?: AbortSignal): Promise<ChainListResponse> {
  return send<ChainListResponse>(`${base(businessId)}/outcome-chains`, { headers: JSON_HEADERS, signal });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return send<T>(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export interface DecisionRequest {
  candidateId: string;
  state: string;
  ownerReason: string | null;
  revisitAt: string | null;
  idempotencyKey: string;
  contract?: unknown;
}
export interface DecisionResponse { decision: OwnerDecisionRecordDto; replayed: boolean }

export const postOwnerDecision = (businessId: string, body: DecisionRequest): Promise<DecisionResponse> => post(`${base(businessId)}/decisions`, body);

export interface ContractRequest { candidateId: string; ownerReason: string | null; idempotencyKey: string; contract: unknown }
export const postOutcomeContract = (businessId: string, body: ContractRequest): Promise<DecisionResponse> => post(`${base(businessId)}/outcome-contracts`, body);

export interface AssessResponse { assessment: OwnerOutcomeAssessmentDto; created: boolean }
/** References only: the client never submits a conclusion. */
export const postAssessOutcome = (businessId: string, candidateId: string): Promise<AssessResponse> => post(`${base(businessId)}/outcome-chain`, { candidateId });
