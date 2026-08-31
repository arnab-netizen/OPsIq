import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  active: "success",
  inactive: "warning",
  archived: "muted",
};

async function fetchClients(search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/clients?${params}`,
    { cache: "no-store" }
  );

  if (!res.ok) return { clients: [], total: 0 };
  return res.json();
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const params = await searchParams;
  const { clients, total } = await fetchClients(params.search, params.status);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage client accounts ({total} total)
          </p>
        </div>
        <Link href="/clients/new">
          <Button>New Client</Button>
        </Link>
      </div>

      <div className="mt-6">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 px-6 text-center">
            <h3 className="text-sm font-medium text-foreground">No clients yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first client to get started.
            </p>
            <Link href="/clients/new" className="mt-4">
              <Button size="sm">Create Client</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Industry</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Engagements</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client: {
                  id: string;
                  name: string;
                  industry: string | null;
                  status: string;
                  createdAt: string;
                  _count: { engagements: number };
                }) => (
                  <tr key={client.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${client.id}`} className="font-medium text-foreground hover:text-[var(--primary-text)]">
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{client.industry ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[client.status] ?? "muted"}>
                        {client.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{client._count.engagements}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(client.createdAt).toLocaleDateString()}
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
