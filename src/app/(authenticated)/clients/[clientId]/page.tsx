import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button } from "@/ui/primitives";

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  active: "success",
  inactive: "warning",
  archived: "muted",
};

async function fetchClient(clientId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/clients/${clientId}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await fetchClient(clientId);

  if (!client) notFound();

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/clients" className="hover:text-foreground">Clients</Link>
        <span>/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Badge variant={STATUS_VARIANTS[client.status] ?? "muted"}>
              {client.status}
            </Badge>
            {client.industry && (
              <span className="text-sm text-muted-foreground">{client.industry}</span>
            )}
          </div>
        </div>
        <Link href={`/engagements/new?clientId=${client.id}`}>
          <Button size="sm">New Engagement</Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">Details</h2>
          <dl className="mt-4 space-y-3">
            {client.legalName && (
              <div>
                <dt className="text-sm text-muted-foreground">Legal Name</dt>
                <dd className="text-sm font-medium text-foreground">{client.legalName}</dd>
              </div>
            )}
            {client.size && (
              <div>
                <dt className="text-sm text-muted-foreground">Size</dt>
                <dd className="text-sm font-medium text-foreground">{client.size}</dd>
              </div>
            )}
            {client.website && (
              <div>
                <dt className="text-sm text-muted-foreground">Website</dt>
                <dd className="text-sm font-medium text-foreground">{client.website}</dd>
              </div>
            )}
            {client.address && (
              <div>
                <dt className="text-sm text-muted-foreground">Address</dt>
                <dd className="text-sm font-medium text-foreground">{client.address}</dd>
              </div>
            )}
            {client.notes && (
              <div>
                <dt className="text-sm text-muted-foreground">Notes</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Contacts ({client.contacts?.length ?? 0})
          </h2>
          {client.contacts && client.contacts.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {client.contacts.map((contact: {
                id: string;
                name: string;
                email: string | null;
                phone: string | null;
                role: string | null;
                isPrimary: boolean;
              }) => (
                <li key={contact.id} className="flex items-start justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {contact.name}
                      {contact.isPrimary && (
                        <Badge variant="default" className="ml-2">Primary</Badge>
                      )}
                    </p>
                    {contact.role && (
                      <p className="text-xs text-muted-foreground">{contact.role}</p>
                    )}
                    {contact.email && (
                      <p className="text-xs text-muted-foreground">{contact.email}</p>
                    )}
                    {contact.phone && (
                      <p className="text-xs text-muted-foreground">{contact.phone}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No contacts added yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground">
            Engagements ({client._count?.engagements ?? 0})
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            View engagements for this client on the{" "}
            <Link href={`/engagements?clientId=${client.id}`} className="text-[var(--primary-text)] hover:underline">
              engagements page
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
