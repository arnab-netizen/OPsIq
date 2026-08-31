import Link from "next/link";
import { Badge, Button } from "@/ui/primitives";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  new: "default",
  qualifying: "warning",
  qualified: "success",
  converted: "success",
  lost: "destructive",
};

async function fetchLeads(search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/leads?${params}`,
    { cache: "no-store" }
  );

  if (!res.ok) return { leads: [], total: 0 };
  return res.json();
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const params = await searchParams;
  const { leads, total } = await fetchLeads(params.search, params.status);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and qualify business leads ({total} total)
          </p>
        </div>
        <Link href="/leads/new">
          <Button>New Lead</Button>
        </Link>
      </div>

      <div className="mt-6">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 px-6 text-center">
            <h3 className="text-sm font-medium text-foreground">No leads yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first lead to start the pipeline.
            </p>
            <Link href="/leads/new" className="mt-4">
              <Button size="sm">Create Lead</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Est. Value</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: {
                  id: string;
                  companyName: string;
                  contactName: string | null;
                  status: string;
                  source: string | null;
                  estimatedValue: number | null;
                  createdAt: string;
                }) => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-foreground hover:text-[var(--primary-text)]">
                        {lead.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.contactName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[lead.status] ?? "muted"}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.source ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {lead.estimatedValue != null
                        ? `$${lead.estimatedValue.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString()}
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
