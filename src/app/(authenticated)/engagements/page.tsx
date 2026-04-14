import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  draft: "muted",
  active: "success",
  paused: "warning",
  completed: "default",
  cancelled: "destructive",
  archived: "muted",
};

const HEALTH_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  healthy: "success",
  at_risk: "warning",
  critical: "destructive",
  unknown: "muted",
};

async function fetchEngagements(search?: string, status?: string, clientId?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (clientId) params.set("clientId", clientId);

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/engagements?${params}`,
    { cache: "no-store" }
  );

  if (!res.ok) return { engagements: [], total: 0 };
  return res.json();
}

export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; clientId?: string }>;
}) {
  const params = await searchParams;
  const { engagements, total } = await fetchEngagements(params.search, params.status, params.clientId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulting engagement lifecycle ({total} total)
          </p>
        </div>
        <Link href="/engagements/new">
          <Button>New Engagement</Button>
        </Link>
      </div>

      <div className="mt-6">
        {engagements.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 px-6 text-center">
            <h3 className="text-sm font-medium text-foreground">No engagements yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an engagement from a client account.
            </p>
            <Link href="/engagements/new" className="mt-4">
              <Button size="sm">Create Engagement</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Health</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mode</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((eng: {
                  id: string;
                  code: string;
                  title: string;
                  status: string;
                  healthStatus: string;
                  interventionMode: string;
                  createdAt: string;
                  client: { id: string; name: string };
                }) => (
                  <tr key={eng.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/engagements/${eng.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {eng.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/engagements/${eng.id}`} className="font-medium text-foreground hover:text-primary">
                        {eng.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${eng.client.id}`} className="text-muted-foreground hover:text-primary">
                        {eng.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[eng.status] ?? "muted"}>
                        {eng.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={HEALTH_VARIANTS[eng.healthStatus] ?? "muted"}>
                        {eng.healthStatus.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {eng.interventionMode.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(eng.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
