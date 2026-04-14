import { EmptyState } from "@/ui/primitives";

export default function EngagementsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulting engagement lifecycle
          </p>
        </div>
      </div>
      <div className="mt-8">
        <EmptyState
          title="No engagements yet"
          description="Create an engagement from a client account."
        />
      </div>
    </div>
  );
}
