"use client";

/**
 * /admin/customers — search, customer detail, access diagnostics, and safe
 * actions (resend verification, suspend/restore workspace access, revoke
 * sessions). Progressive disclosure: search results are minimal; detail is
 * only fetched for a selected customer. No raw JSON, no infra secrets.
 */

import { useState } from "react";
import { Badge, Button, Input, LoadingState } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { createClientIdempotencyKey } from "@/lib/client-idempotency";

interface SearchResult {
  userId: string | null;
  email: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceRole: string | null;
}

interface CustomerDetail {
  email: string;
  betaRequest: { status: string; invitedAt: string | null; invitedExpired: boolean; revokedAt: string | null; rejectedAt: string | null; createdAt: string } | null;
  user: { id: string; isActive: boolean; emailVerifiedAt: string | null; createdAt: string; activeSessionCount: number } | null;
  memberships: Array<{ workspaceId: string; workspaceName: string; workspaceSignupSource: string | null; workspaceIsActive: boolean; role: string; isActive: boolean; accessStatus: string }>;
}

interface Diagnostics {
  canRequestBeta: { allowed: boolean; reason: string };
  canSignUp: { allowed: boolean; reason: string };
  canVerifyEmail: { allowed: boolean; reason: string };
  canSignIn: { allowed: boolean; reason: string };
  canAccessWorkspace: { workspaceId: string; allowed: boolean; reason: string } | null;
}

async function jsonOrThrow(res: Response, fallback: string) {
  if (!res.ok) {
    if (res.status === 403) {
      const err = new Error("Forbidden") as Error & { httpStatus?: number };
      err.httpStatus = 403;
      throw err;
    }
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? fallback);
  }
  return res.json();
}

function AccessGate({ label, check }: { label: string; check: { allowed: boolean; reason: string } }) {
  return (
    <div className="flex items-center justify-between rounded border p-2 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <Badge variant={check.allowed ? "success" : "outline"}>{check.allowed ? "Allowed" : "Blocked"}</Badge>
        <span className="text-xs text-muted-foreground">{check.reason}</span>
      </div>
    </div>
  );
}

export default function AdminCustomersPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const runSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setForbidden(false);
    try {
      const data = await jsonOrThrow(await fetch(`/api/admin/customers/search?query=${encodeURIComponent(query)}`), "Search failed");
      setResults(data.results as SearchResult[]);
    } catch (e) {
      const tagged = e as Error & { httpStatus?: number };
      if (tagged.httpStatus === 403) {
        setForbidden(true);
      } else {
        const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "load" });
        setSearchError(governed.operatorMessage);
      }
    } finally {
      setSearching(false);
    }
  };

  const selectCustomer = async (email: string) => {
    setSelectedEmail(email);
    setDetailLoading(true);
    setDetailError(null);
    setActionError(null);
    setActionMessage(null);
    try {
      const detailData: CustomerDetail = await jsonOrThrow(
        await fetch(`/api/admin/customers/detail?email=${encodeURIComponent(email)}`),
        "Failed to load customer detail"
      );
      setDetail(detailData);
      const primaryWorkspaceId = detailData.memberships[0]?.workspaceId;
      const diagUrl = primaryWorkspaceId
        ? `/api/admin/customers/diagnostics?email=${encodeURIComponent(email)}&workspaceId=${primaryWorkspaceId}`
        : `/api/admin/customers/diagnostics?email=${encodeURIComponent(email)}`;
      const diagData: Diagnostics = await jsonOrThrow(await fetch(diagUrl), "Failed to load diagnostics");
      setDiagnostics(diagData);
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "load" });
      setDetailError(governed.operatorMessage);
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async (action: "resend-verification" | "suspend" | "restore" | "revoke-sessions", workspaceId?: string) => {
    if (!selectedEmail) return;
    setActionBusy(action);
    setActionError(null);
    setActionMessage(null);
    try {
      const idempotencyKey = createClientIdempotencyKey(`${action}-${selectedEmail}-${workspaceId ?? ""}`);
      const res = await fetch(`/api/admin/customers/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ email: selectedEmail, ...(workspaceId ? { workspaceId } : {}) }),
      });
      const result = await jsonOrThrow(res, `Failed to ${action.replace("-", " ")}`);
      if (action === "resend-verification") {
        setActionMessage(result.sent ? "Verification email sent." : "No eligible pending verification for this account.");
      } else if (action === "revoke-sessions") {
        setActionMessage(`${result.revokedCount} session(s) revoked (account-wide).`);
      } else {
        setActionMessage(`Workspace access ${result.status === "SUSPENDED" ? "suspended" : "restored"}.`);
      }
      await selectCustomer(selectedEmail);
    } catch (e) {
      const governed = classifyOperatorError(e instanceof Error ? e : new Error(String(e)), { context: "action" });
      setActionError(governed.operatorMessage);
    } finally {
      setActionBusy(null);
    }
  };

  if (forbidden) return <GovernedEmptyState reason="permission_denied" />;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-gray-600">Search by email or workspace name. Actions are workspace-scoped unless noted otherwise.</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by email or workspace name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void runSearch()}
          className="max-w-md"
        />
        <Button onClick={() => void runSearch()} isLoading={searching} disabled={searching || !query.trim()}>
          Search
        </Button>
      </div>
      {searchError && <p className="text-sm text-destructive">{searchError}</p>}

      {results && (
        <div className="space-y-2">
          {results.length === 0 && <GovernedEmptyState reason="no_data" helpText="No matching customers found." />}
          {results.map((r) => (
            <button
              key={`${r.userId}-${r.workspaceId}`}
              onClick={() => void selectCustomer(r.email)}
              className={`block w-full rounded border p-3 text-left text-sm hover:bg-muted ${selectedEmail === r.email ? "border-primary" : ""}`}
            >
              <span className="font-medium">{r.email}</span>
              {r.workspaceName && <span className="ml-2 text-muted-foreground">— {r.workspaceName} ({r.workspaceRole})</span>}
            </button>
          ))}
        </div>
      )}

      {selectedEmail && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{selectedEmail}</h2>
          {detailLoading && <LoadingState message="Loading customer detail..." />}
          {detailError && <p className="text-sm text-destructive">{detailError}</p>}

          {detail && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded border p-3 text-sm">
                  <h3 className="mb-2 font-medium">Beta request</h3>
                  {detail.betaRequest ? (
                    <>
                      <p>
                        Status: <Badge variant="outline">{detail.betaRequest.status}</Badge>
                        {detail.betaRequest.invitedExpired && <Badge variant="warning" className="ml-1">expired</Badge>}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Requested {new Date(detail.betaRequest.createdAt).toLocaleString()}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No beta request on file.</p>
                  )}
                </div>
                <div className="rounded border p-3 text-sm">
                  <h3 className="mb-2 font-medium">Account</h3>
                  {detail.user ? (
                    <>
                      <p>Active: {detail.user.isActive ? "Yes" : "No"}</p>
                      <p>Email verified: {detail.user.emailVerifiedAt ? "Yes" : "No"}</p>
                      <p>Active sessions (account-wide): {detail.user.activeSessionCount}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Created {new Date(detail.user.createdAt).toLocaleString()}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No account created yet.</p>
                  )}
                </div>
              </div>

              {detail.memberships.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">Workspaces</h3>
                  {detail.memberships.map((m) => (
                    <div key={m.workspaceId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                      <div>
                        <p className="font-medium">{m.workspaceName}</p>
                        <p className="text-xs text-muted-foreground">
                          Role: {m.role} · Signup source: {m.workspaceSignupSource ?? "—"} · Workspace active: {m.workspaceIsActive ? "yes" : "no"}
                        </p>
                        <Badge
                          variant={m.accessStatus === "ACTIVE" ? "success" : m.accessStatus === "SUSPENDED" ? "warning" : "destructive"}
                          className="mt-1"
                        >
                          {m.accessStatus}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        {m.accessStatus === "ACTIVE" && (
                          <Button size="sm" variant="outline" isLoading={actionBusy === "suspend"} onClick={() => void runAction("suspend", m.workspaceId)}>
                            Suspend workspace access
                          </Button>
                        )}
                        {m.accessStatus === "SUSPENDED" && (
                          <Button size="sm" variant="secondary" isLoading={actionBusy === "restore"} onClick={() => void runAction("restore", m.workspaceId)}>
                            Restore workspace access
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" isLoading={actionBusy === "resend-verification"} onClick={() => void runAction("resend-verification")}>
                  Resend verification
                </Button>
                <Button size="sm" variant="outline" isLoading={actionBusy === "revoke-sessions"} onClick={() => void runAction("revoke-sessions")}>
                  Revoke all sessions (account-wide)
                </Button>
              </div>
              {actionMessage && <p className="text-sm text-success">{actionMessage}</p>}
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}

              {diagnostics && (
                <div className="space-y-2">
                  <h3 className="font-medium">Access diagnostics</h3>
                  <AccessGate label="Can request beta" check={diagnostics.canRequestBeta} />
                  <AccessGate label="Can sign up" check={diagnostics.canSignUp} />
                  <AccessGate label="Can verify email" check={diagnostics.canVerifyEmail} />
                  <AccessGate label="Can sign in" check={diagnostics.canSignIn} />
                  {diagnostics.canAccessWorkspace && <AccessGate label="Can access workspace" check={diagnostics.canAccessWorkspace} />}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
