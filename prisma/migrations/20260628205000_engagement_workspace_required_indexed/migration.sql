-- GAP-ISO-02 — Engagement workspace scope. The workspace_id column becomes NOT NULL and gains an
-- index so workspace-scoped queries are indexed and no null-workspace (orphan) engagement can escape
-- workspace filtering. SET NOT NULL is fail-safe: it succeeds on any database where engagements
-- already carry a workspace (enforced at the application layer — every engagement.create passes
-- workspaceId, verified by tsc). If a deploy surfaces real orphan rows, it fails loudly here rather
-- than silently corrupting isolation — documented manual remediation: assign the correct workspace
-- to the orphan engagements, then re-run.
ALTER TABLE "engagements" ALTER COLUMN "workspace_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "engagements_workspace_id_idx" ON "engagements"("workspace_id");
