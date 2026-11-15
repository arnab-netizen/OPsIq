import { httpResponseErrorFromBody, type HttpResponseError } from "@/lib/operator-safe-errors";

/** A failed Finance write: the HTTP error (status + field errors) plus the parsed body, whose machine `code` / `snapshotId` the form branches on. */
export type FinanceWriteError = HttpResponseError & { responseBody: unknown };

async function financeJson(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(httpResponseErrorFromBody(res.status, data), { responseBody: data }) as FinanceWriteError;
  return data;
}

export interface AmendResult { newSnapshotId: string; previousSnapshotId: string; version: number }

/** POST the governed amendment: the earlier version is kept, the new one becomes current evidence. */
export async function amendFinanceSnapshot(snapshotId: string, body: Record<string, unknown>): Promise<AmendResult> {
  return (await financeJson(`/api/owner/finance/snapshots/${encodeURIComponent(snapshotId)}/amend`, { method: "POST", body: JSON.stringify(body) })) as AmendResult;
}

export async function listFinanceSnapshots(businessId: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`/api/owner/finance/businesses/${encodeURIComponent(businessId)}/snapshots`);
  if (!res?.ok) return [];
  const body = await res.json().catch(() => null);
  const list = Array.isArray(body) ? body : body?.snapshots;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}
