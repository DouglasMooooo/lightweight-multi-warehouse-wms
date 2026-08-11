CREATE TYPE "ShadowImportMode" AS ENUM ('DRY_RUN', 'SHADOW_SEED');
CREATE TYPE "ShadowImportStatus" AS ENUM ('Completed', 'Rejected', 'Failed');

CREATE TABLE "ShadowImportBatch" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "mode" "ShadowImportMode" NOT NULL,
    "cutoverAt" TIMESTAMP(3) NOT NULL,
    "status" "ShadowImportStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "acceptedRows" INTEGER NOT NULL,
    "warningRows" INTEGER NOT NULL,
    "rejectedRows" INTEGER NOT NULL,
    "notes" TEXT,
    "issues" JSONB,
    "createdById" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShadowImportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockTransaction" ADD COLUMN "shadowImportBatchId" TEXT;

CREATE UNIQUE INDEX "ShadowImportBatch_sourceChecksum_mode_cutoverAt_key"
ON "ShadowImportBatch"("sourceChecksum", "mode", "cutoverAt");
CREATE INDEX "ShadowImportBatch_importedAt_idx" ON "ShadowImportBatch"("importedAt");
CREATE INDEX "ShadowImportBatch_status_idx" ON "ShadowImportBatch"("status");
CREATE INDEX "StockTransaction_shadowImportBatchId_idx" ON "StockTransaction"("shadowImportBatchId");

ALTER TABLE "ShadowImportBatch"
ADD CONSTRAINT "ShadowImportBatch_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransaction"
ADD CONSTRAINT "StockTransaction_shadowImportBatchId_fkey"
FOREIGN KEY ("shadowImportBatchId") REFERENCES "ShadowImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
