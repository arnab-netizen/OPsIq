"use client";

import { useEffect, useState } from "react";
import { Badge, ErrorState, CardDashboardSkeleton } from "@/ui/primitives";
import { GovernedEmptyState } from "@/components/ui/GovernedEmptyState";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { formatRole } from "@/domain/constants/role-labels";

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    isActive: boolean;
  };
  roles: Array<{
    id: string;
    role: string;
    scope: string | null;
    scopeId: string | null;
  }>;
  memberships: Array<{
    id: string;
    engagementId: string;
    role: string;
  }>;
  highestRole: string | null;
  isInternal: boolean;
  isSelfServeOwner: boolean;
}

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const fetchProfile = () => {
    setLoading(true);
    setErrorDetails(null);
    fetch("/api/me")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message ?? "Failed to load profile");
        }
        return res.json();
      })
      .then((data) => {
        setMe(data);
        setLoading(false);
      })
      .catch((err) => {
        setErrorDetails(classifyOperatorError(err, { context: "load" }).operatorMessage);
        setLoading(false);
      });
  };

  useEffect(() => {
    // Intentional one-shot data fetch on mount; fetchProfile() sets state from the API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfile();
  }, []);

  if (loading) return <CardDashboardSkeleton sections={4} label="Loading profile" />;
  if (errorDetails) return <ErrorState message={errorDetails} />; // classifyOperatorError
  if (!me) {
    return (
      <GovernedEmptyState
        reason="loading_failed"
        primaryAction={{
          label: "Retry",
          onClick: fetchProfile,
        }}
        helpText="Your profile information could not be loaded."
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your profile and access information
      </p>

      <div className="mt-8 space-y-6">
        {/* Data and account help */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Data and account help</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            To request data or account deletion during beta, contact{" "}
            <a href="mailto:support@opsiq.solutions" className="text-[var(--primary-text)] hover:underline">
              support@opsiq.solutions
            </a>
            .
          </p>
        </div>

        {/* Profile Section */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {me.user.name ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {me.user.email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge variant={me.user.isActive ? "success" : "destructive"}>
                  {me.user.isActive ? "Active" : "Inactive"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {me.isSelfServeOwner ? "Account type" : "Access Type"}
              </dt>
              <dd className="mt-1">
                {me.isSelfServeOwner ? (
                  <Badge variant="outline">Business owner</Badge>
                ) : (
                  <Badge variant={me.isInternal ? "default" : "outline"}>
                    {me.isInternal ? "Internal" : "External"}
                  </Badge>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Roles Section — a self-serve business owner is granted the same internal
            admin_or_portfolio_manager role name used for staff portfolio managers (an
            implementation detail of how signup provisions capabilities, not a meaningful identity
            to a lay owner). A real human usability test found seeing "Admin / Portfolio Mgr" and
            "Access Type: Internal" made an ordinary owner believe they were on an internal/test
            build. The Profile card above now states their actual account type plainly; this raw
            role/capability detail moves behind a disclosure instead of disappearing, so it is still
            reachable (support, debugging) without being the first thing an owner reads. */}
        {me.isSelfServeOwner ? (
          <details className="rounded-lg border border-border p-6">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Advanced account details
            </summary>
            <div className="mt-4 space-y-2">
              {me.roles.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <Badge variant="default">{formatRole(r.role)}</Badge>
                  {r.scope && (
                    <span className="text-xs text-muted-foreground">
                      Scope: {r.scope}
                      {r.scopeId ? ` (${r.scopeId})` : ""}
                    </span>
                  )}
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                This is internal system detail, not a special access level — every business owner
                account is set up this way.
              </p>
            </div>
          </details>
        ) : (
          <>
            {/* Roles Section */}
            <div className="rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground">Roles</h2>
              {me.roles.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No roles assigned.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {me.roles.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
                    >
                      <Badge variant="default">{formatRole(r.role)}</Badge>
                      {r.scope && (
                        <span className="text-xs text-muted-foreground">
                          Scope: {r.scope}
                          {r.scopeId ? ` (${r.scopeId})` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {me.highestRole && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Effective role: {formatRole(me.highestRole)}
                </p>
              )}
            </div>

            {/* Engagement Memberships Section */}
            <div className="rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground">
                Engagement Memberships
              </h2>
              {me.memberships.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Not assigned to any engagements.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {me.memberships.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
                    >
                      <Badge variant="outline">{formatRole(m.role)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Engagement: {m.engagementId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
