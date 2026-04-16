"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/ui/primitives";
import { LoadingState, EmptyState, ErrorState } from "@/ui/primitives/states";
import { Modal } from "@/ui/primitives/modal";
import { Button } from "@/ui/primitives";
import CreateShockEventModal from "./create-shock-event-modal";
import ShockEventDetailModal from "./shock-event-detail-modal";

interface ShockEvent {
  id: string;
  type: string;
  severity: string;
  happenedAt: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

const SEVERITY_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  KEY_EMPLOYEE_LOSS: "Key Employee Loss",
  MAJOR_CLIENT_LOSS: "Major Client Loss",
  PAYROLL_PRESSURE: "Payroll Pressure",
  MARGIN_COLLAPSE: "Margin Collapse",
  SUPPLIER_FAILURE: "Supplier Failure",
  SERVICE_BREAKDOWN: "Service Breakdown",
  COMPLIANCE_ISSUE: "Compliance Issue",
  REPUTATION_DAMAGE: "Reputation Damage",
  INTERNAL_CONFLICT: "Internal Conflict",
  OWNER_WITHDRAWAL: "Owner Withdrawal",
  EXECUTION_STALL: "Execution Stall",
};

interface ShockEventListProps {
  engagementId: string;
}

export default function ShockEventList({ engagementId }: ShockEventListProps) {
  const [shockEvents, setShockEvents] = useState<ShockEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ShockEvent | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  async function fetchShockEvents() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/shock-events?limit=50`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch shock events");
      }

      const data = await res.json();
      setShockEvents(data.shockEvents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchShockEvents();
  }, [engagementId]);

  async function handleCreateSuccess() {
    setIsCreateModalOpen(false);
    await fetchShockEvents();
  }

  function handleSelectEvent(event: ShockEvent) {
    setSelectedEvent(event);
    setIsDetailModalOpen(true);
  }

  if (isLoading) {
    return <LoadingState message="Loading shock events..." />;
  }

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Shock Events ({shockEvents.length})
        </h2>
        <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
          Record Shock Event
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorState
            title="Failed to load shock events"
            message={error}
            onRetry={fetchShockEvents}
          />
        </div>
      )}

      {!error && shockEvents.length === 0 && (
        <div className="mt-4">
          <EmptyState
            title="No shock events recorded"
            description="Shock events will appear here once they are recorded."
            action={
              <Button onClick={() => setIsCreateModalOpen(true)} variant="outline" size="sm">
                Record First Shock Event
              </Button>
            }
          />
        </div>
      )}

      {!error && shockEvents.length > 0 && (
        <div className="mt-4 space-y-2">
          {shockEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => handleSelectEvent(event)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {TYPE_LABELS[event.type] || event.type}
                  </span>
                  <Badge variant={SEVERITY_VARIANTS[event.severity] || "muted"}>
                    {event.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(event.happenedAt).toLocaleDateString()} at{" "}
                  {new Date(event.happenedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {event.notes && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {event.notes}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5L15.75 12l-7.5 7.5"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateShockEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        engagementId={engagementId}
        onSuccess={handleCreateSuccess}
      />

      {selectedEvent && (
        <ShockEventDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
        />
      )}
    </div>
  );
}
