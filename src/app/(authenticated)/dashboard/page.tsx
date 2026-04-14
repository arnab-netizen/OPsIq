import { EmptyState } from "@/ui/primitives";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Business intervention overview
      </p>
      <div className="mt-8">
        <EmptyState
          title="No active engagements"
          description="Create a client and start an engagement to see your dashboard."
        />
      </div>
    </div>
  );
}
