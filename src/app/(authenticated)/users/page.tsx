"use client";

import { useEffect, useState, useCallback } from "react";
import { Table, Badge, LoadingState, ErrorState } from "@/ui/primitives";
import { formatRole } from "@/domain/constants/role-labels";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { toHttpResponseError } from "@/lib/operator-safe-errors";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  limit: number;
  offset: number;
}

interface UserRoleRow {
  id: string;
  role: string;
  scope: string | null;
  scopeId: string | null;
}

function UserRoles({ userId }: { userId: string }) {
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}/roles`)
      .then((r) => r.json())
      .then((data) => {
        setRoles(data.roles ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return <span className="text-xs text-muted-foreground">...</span>;
  if (roles.length === 0)
    return <span className="text-xs text-muted-foreground">No roles</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r.id} variant="default">
          {formatRole(r.role)}
          {r.scope ? ` (${r.scope})` : ""}
        </Badge>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorDetails(null);
    try {
      const res = await fetch("/api/users?limit=50");
      if (!res.ok) {
        // Preserve the real HTTP status and the server's governed error
        // message instead of discarding them behind a generic message -- a
        // 403 (missing USER_VIEW capability) or 401 must render as its own
        // distinguishable, actionable message, not collapse into "Couldn't
        // load that data" alongside a genuine server/network failure.
        throw await toHttpResponseError(res);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
      setErrorDetails(governed.operatorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) return <LoadingState message="Loading users..." />;
  if (errorDetails) return <ErrorState message={errorDetails} onRetry={fetchUsers} />; // classifyOperatorError

  const users = data?.users ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users, roles, and engagement memberships
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {data?.total ?? 0} total users
        </div>
      </div>

      <div className="mt-6">
        <Table<UserRow>
          columns={[
            {
              key: "name",
              header: "Name",
              render: (row) => (
                <div>
                  <span className="font-medium text-foreground">
                    {row.name ?? "Unnamed"}
                  </span>
                </div>
              ),
            },
            {
              key: "email",
              header: "Email",
              render: (row) => (
                <span className="text-muted-foreground">{row.email}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge variant={row.isActive ? "success" : "destructive"}>
                  {row.isActive ? "Active" : "Inactive"}
                </Badge>
              ),
            },
            {
              key: "roles",
              header: "Roles",
              render: (row) => <UserRoles userId={row.id} />,
            },
            {
              key: "createdAt",
              header: "Created",
              render: (row) =>
                new Date(row.createdAt).toLocaleDateString(),
            },
          ]}
          data={users}
          keyExtractor={(row) => row.id}
          emptyMessage="No users found"
        />
      </div>
    </div>
  );
}
