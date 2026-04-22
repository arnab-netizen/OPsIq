-- Drop the existing foreign key for recommendation_id
ALTER TABLE "actions" DROP CONSTRAINT "actions_recommendation_id_fkey";

-- Add UNIQUE constraint on recommendation_id
ALTER TABLE "actions" ADD CONSTRAINT "actions_recommendation_id_key" UNIQUE ("recommendation_id");

-- Re-add the foreign key with RESTRICT instead of CASCADE
ALTER TABLE "actions" ADD CONSTRAINT "actions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
