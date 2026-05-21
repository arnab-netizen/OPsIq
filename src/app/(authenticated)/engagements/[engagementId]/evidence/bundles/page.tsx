"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Table, LoadingState, EmptyState, ErrorState } from "@/ui/primitives";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CreateBundleForm } from "./create-bundle-form";

interface BundleItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  _count: { items: number };
}

export default function BundlesPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [bundles, setBundles] = useState<BundleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    params.then((p) => setEngagementId(p.engagementId));
  }, [params]);

  useEffect(() => {
    if (!engagementId) return;

    async function fetchBundles() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/evidence-bundles?engagementId=${engagementId}`);
        if (!res.ok) {
          throw new Error("Failed to load bundles");
        }
        const data = await res.json();
        setBundles(data.bundles ?? []);
      } catch (err) {
        const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'load' });
        setError(governed.operatorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBundles();
  }, [engagementId]);

  function handleBundleCreated() {
    setShowCreateForm(false);
    // Refetch bundles
    if (engagementId) {
      fetch(`/api/evidence-bundles?engagementId=${engagementId}`)
        .then((res) => res.json())
        .then((data) => setBundles(data.bundles ?? []))
        .catch(() => {});
    }
  }

  if (!engagementId) {
    return <LoadingState />;
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
        <span className="text-foreground">Bundles</span>
      </div>

      {/* Header */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Evidence Bundles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group evidence together for organization and review.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          Create Bundle
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateBundleForm
          engagementId={engagementId}
          onSuccess={handleBundleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Content */}
      <div className="mt-8">
        {error && (
          <ErrorState
            title="Failed to load bundles"
            message={error}
            onRetry={() => {
              if (engagementId) {
                fetch(`/api/evidence-bundles?engagementId=${engagementId}`)
                  .then((res) => res.json())
                  .then((data) => {
                    setBundles(data.bundles ?? []);
                    setError(null);
                  })
                  .catch((err) => {
                    setError(classifyOperatorError(err, { context: "load" }).operatorMessage);
                  });
              }
            }}
          />
        )}

        {isLoading && !error && <LoadingState message="Loading bundles..." />}

        {!isLoading && !error && bundles.length === 0 && (
          <EmptyState
            title="No bundles yet"
            description="Create a bundle to group and organize evidence."
            action={
              <Button onClick={() => setShowCreateForm(true)}>
                Create Bundle
              </Button>
            }
          />
        )}

        {!isLoading && !error && bundles.length > 0 && (
          <Table
            columns={[
              {
                key: "title",
                header: "Title",
                render: (item: BundleItem) => (
                  <Link
                    href={`/engagements/${engagementId}/evidence/bundles/${item.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.title}
                  </Link>
                ),
              },
              {
                key: "description",
                header: "Description",
                render: (item: BundleItem) => (
                  <span className="text-sm text-muted-foreground">
                    {item.description || "—"}
                  </span>
                ),
              },
              {
                key: "itemCount",
                header: "Items",
                render: (item: BundleItem) => (
                  <span className="text-sm">{item._count.items}</span>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (item: BundleItem) => (
                  <span className="text-xs text-muted-foreground capitalize">
                    {item.status}
                  </span>
                ),
              },
            ]}
            data={bundles}
            keyExtractor={(item) => item.id}
            emptyMessage="No bundles"
          />
        )}
      </div>
    </div>
  );
}
