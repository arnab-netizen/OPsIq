-- B15: Fix benchmark result column types
-- false_positives and false_negatives were TEXT[] but should be JSONB
-- to match Prisma schema and handle JavaScript array serialization

ALTER TABLE case_benchmark_results
  ALTER COLUMN false_positives SET DATA TYPE jsonb USING false_positives::jsonb,
  ALTER COLUMN false_negatives SET DATA TYPE jsonb USING false_negatives::jsonb;
