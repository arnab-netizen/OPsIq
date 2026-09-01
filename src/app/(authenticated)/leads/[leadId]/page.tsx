import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/ui/primitives";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  new: "default",
  qualifying: "warning",
  qualified: "success",
  converted: "success",
  lost: "destructive",
};

async function fetchLead(leadId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/leads/${leadId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const lead = await fetchLead(leadId);

  if (!lead) notFound();

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/leads" className="hover:text-foreground">Leads</Link>
        <span>/</span>
        <span className="text-foreground">{lead.companyName}</span>
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{lead.companyName}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Badge variant={STATUS_VARIANTS[lead.status] ?? "muted"}>
              {lead.status}
            </Badge>
            {lead.source && (
              <span className="text-sm text-muted-foreground">Source: {lead.source}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Contact Information</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium text-foreground">{lead.contactName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="text-sm font-medium text-foreground">{lead.contactEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Phone</dt>
              <dd className="text-sm font-medium text-foreground">{lead.contactPhone ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Details</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">Estimated Value</dt>
              <dd className="text-sm font-medium text-foreground">
                {lead.estimatedValue != null ? `$${lead.estimatedValue.toLocaleString()}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="text-sm font-medium text-foreground">
                {new Date(lead.createdAt).toLocaleDateString()}
              </dd>
            </div>
            {lead.notes && (
              <div>
                <dt className="text-sm text-muted-foreground">Notes</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {lead.client && (
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground">Converted Client</h2>
            <p className="mt-2 text-sm">
              <Link href={`/clients/${lead.client.id}`} className="text-[var(--primary-text)] hover:underline">
                {lead.client.name}
              </Link>
            </p>
          </div>
        )}

        {lead.engagement && (
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground">Linked Engagement</h2>
            <p className="mt-2 text-sm">
              <Link href={`/engagements/${lead.engagement.id}`} className="text-[var(--primary-text)] hover:underline">
                {lead.engagement.code} — {lead.engagement.title}
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
