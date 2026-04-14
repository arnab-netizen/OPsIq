import { EmptyState } from "@/ui/primitives";

export default function ClientsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage client accounts
          </p>
        </div>
      </div>
      <div className="mt-8">
        <EmptyState
          title="No clients yet"
          description="Add your first client to get started."
        />
      </div>
    </div>
  );
}
