-- CreateTable InterventionState
CREATE TABLE "intervention_states" (
    "id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "current_phase" TEXT NOT NULL,
    "previous_phase" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intervention_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intervention_states_engagement_id_key" ON "intervention_states"("engagement_id");

-- CreateIndex
CREATE INDEX "intervention_states_engagement_id_idx" ON "intervention_states"("engagement_id");

-- AddForeignKey
ALTER TABLE "intervention_states" ADD CONSTRAINT "intervention_states_engagement_id_fkey" FOREIGN KEY ("engagement_id") REFERENCES "engagements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
