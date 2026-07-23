-- Stage 3 Slice 3.3 — Add source_operator_item_id to delegated_tasks
-- Traceability: optional FK back to the OperatorItem that originated a delegated task.
-- Additive only; nullable; no existing rows affected.

ALTER TABLE "delegated_tasks" ADD COLUMN "source_operator_item_id" UUID;
