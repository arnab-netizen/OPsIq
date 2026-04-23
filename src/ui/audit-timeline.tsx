"use client";

import { useEffect, useState } from "react";

interface AuditEvent {
  id: string;
  eventName: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorId: string;
  payload: Record<string, unknown>;
}

interface AuditTimelineProps {
  engagementId: string;
}

export function AuditTimeline({ engagementId }: AuditTimelineProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAuditEvents() {
      try {
        const params = new URLSearchParams({
          engagementId,
          limit: "50",
          offset: "0",
        });
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/audit/events?${params}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          setError("Failed to fetch audit events");
          return;
        }
        const data = await res.json();
        setEvents(data.items || []);
      } catch (err) {
        setError("Error loading audit timeline");
      } finally {
        setLoading(false);
      }
    }

    fetchAuditEvents();
  }, [engagementId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">Audit Timeline</h2>
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">Audit Timeline</h2>
        <p className="mt-4 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground">
        Audit Timeline ({events.length})
      </h2>
      {events.length > 0 ? (
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-md border border-border p-3 text-xs"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {event.eventName}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {event.entityType}: {event.entityId}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    by {event.actorId}
                  </p>
                </div>
                <div className="text-right text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No audit events found.
        </p>
      )}
    </div>
  );
}
