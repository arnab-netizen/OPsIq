"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Badge, LoadingState, ErrorState } from "@/ui/primitives";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

interface EvidenceDetail {
  id: string;
  category: string;
  evidenceType: string;
  sourceType: string;
  sourceLabel: string;
  title: string;
  description: string | null;
  content: string | null;
  validationStatus: string;
  visibility: string;
  traceabilityStatus: string;
  capturedAt: string;
  createdAt: string;
  fileBlob?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
  sourceContact?: {
    id: string;
    name: string;
    role: string | null;
  } | null;
  bundleItems: Array<{ bundleId: string }>;
}

const CATEGORY_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  FINANCIAL: "default",
  OPERATIONAL: "success",
  HUMAN: "warning",
  RESILIENCE: "warning",
  CLIENT: "default",
  COMMERCIAL: "default",
  LEADERSHIP: "warning",
  EXECUTION: "success",
};

const VALIDATION_COLORS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  PENDING: "muted",
  VALIDATED: "success",
  INVALID: "destructive",
};

export default function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string; evidenceId: string }>;
}) {
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => {
      setEngagementId(p.engagementId);
      setEvidenceId(p.evidenceId);
    });
  }, [params]);

  useEffect(() => {
    if (!evidenceId) return;

    async function fetchEvidence() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/evidence/${evidenceId}`);
        if (!res.ok) {
          throw new Error("Failed to load evidence");
        }
        const data = await res.json();
        setEvidence(data);
      } catch (err) {
        setError(toOperatorSafeError(err, "load").error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvidence();
  }, [evidenceId]);

  if (!engagementId || !evidenceId) {
    return <LoadingState />;
  }

  if (isLoading) {
    return <LoadingState message="Loading evidence..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load evidence"
        message={error}
      />
    );
  }

  if (!evidence) {
    return (
      <ErrorState
        title="Evidence not found"
        message="The evidence you're looking for doesn't exist."
      />
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/engagements" className="hover:text-foreground">
          Engagements
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}`}
          className="hover:text-foreground"
        >
          Details
        </Link>
        <span>/</span>
        <Link
          href={`/engagements/${engagementId}/evidence`}
          className="hover:text-foreground"
        >
          Evidence
        </Link>
        <span>/</span>
        <span className="text-foreground">{evidence.title}</span>
      </div>

      {/* Header */}
      <div className="mt-6 rounded-lg border border-border bg-muted/10 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={CATEGORY_COLORS[evidence.category] ?? "muted"}>
                {evidence.category}
              </Badge>
              <Badge variant={VALIDATION_COLORS[evidence.validationStatus] ?? "muted"}>
                {evidence.validationStatus}
              </Badge>
              <Badge variant="outline">{evidence.evidenceType}</Badge>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">
              {evidence.title}
            </h1>
            {evidence.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {evidence.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Source Information */}
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground uppercase">
            Source
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Type</p>
              <p className="mt-1 text-sm text-foreground">{evidence.sourceType}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Label</p>
              <p className="mt-1 text-sm text-foreground">{evidence.sourceLabel}</p>
            </div>
            {evidence.sourceContact && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Contact</p>
                <div className="mt-1">
                  <p className="text-sm font-medium text-foreground">
                    {evidence.sourceContact.name}
                  </p>
                  {evidence.sourceContact.role && (
                    <p className="text-xs text-muted-foreground">
                      {evidence.sourceContact.role}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Evidence Metadata */}
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground uppercase">
            Details
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Visibility</p>
              <p className="mt-1 text-sm text-foreground">
                {evidence.visibility.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Traceability</p>
              <p className="mt-1 text-sm text-foreground">
                {evidence.traceabilityStatus}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Captured At</p>
              <p className="mt-1 text-sm text-foreground">
                {new Date(evidence.capturedAt).toLocaleDateString()} at{" "}
                {new Date(evidence.capturedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content or File */}
      <div className="mt-8">
        {evidence.fileBlob ? (
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground uppercase">
              File
            </h2>
            <div className="mt-4 flex items-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <svg
                className="h-8 w-8 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0013.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12a3 3 0 110-6H8.25"
                />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {evidence.fileBlob.fileName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {evidence.fileBlob.mimeType} •{" "}
                  {(evidence.fileBlob.sizeBytes / 1024).toFixed(1)} KB
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Stored in vault
              </div>
            </div>
          </div>
        ) : evidence.content ? (
          <div className="rounded-lg border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground uppercase">
              Content
            </h2>
            <div className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground">
              {evidence.content}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bundles */}
      {evidence.bundleItems.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground uppercase">
            In Bundles
          </h2>
          <div className="mt-4 space-y-2">
            {evidence.bundleItems.map((item) => (
              <Link
                key={item.bundleId}
                href={`/engagements/${engagementId}/evidence/bundles/${item.bundleId}`}
                className="block rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
              >
                <p className="text-sm text-primary hover:underline">
                  View bundle
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
