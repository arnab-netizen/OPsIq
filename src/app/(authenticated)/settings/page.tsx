"use client";

import { useEffect, useState } from "react";
import { Badge, LoadingState, ErrorState } from "@/ui/primitives";
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
}

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingState message="Loading profile..." />;
  if (error) return <ErrorState message={error} />;
  if (!me) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your profile and access information
      </p>

      <div className="mt-8 space-y-6">
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
              <dt className="text-sm text-muted-foreground">Access Type</dt>
              <dd className="mt-1">
                <Badge variant={me.isInternal ? "default" : "outline"}>
                  {me.isInternal ? "Internal" : "External"}
                </Badge>
              </dd>
            </div>
          </dl>
        </div>

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
      </div>
    </div>
  );
}
