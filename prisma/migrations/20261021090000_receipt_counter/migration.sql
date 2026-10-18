-- Receipt numbers are allocated from a per-school, per-year counter taken under the row lock in the fulfilment transaction, and a school
-- can never hold two payments with the same receipt number (plan "Fix design - Phase 1 review findings", F1; issue ISS-0001).
-- ADDITIVE: one new table, one partial unique index. Existing duplicates are renamed BEFORE the index is created, so it cannot fail
-- on data that already exists; the counter is seeded from the highest number already issued, so new numbers never collide with old ones.
-- Row-level security ships in this same file.

-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("tenantId","year")
);

-- AddForeignKey
ALTER TABLE "ReceiptCounter" ADD CONSTRAINT "ReceiptCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptCounter" ADD CONSTRAINT "ReceiptCounter_range" CHECK ("year" BETWEEN 1900 AND 9999 AND "next" >= 1);

-- Existing duplicates: keep the oldest payment's number, give the others a deterministic suffix (-R2, -R3 ... in paidAt/createdAt order).
-- The number of rows renamed is the number of payments that shared a receipt number before this migration.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId", "receiptNo" ORDER BY COALESCE("paidAt", "createdAt"), id) AS rn
  FROM "Payment"
  WHERE "receiptNo" IS NOT NULL
)
UPDATE "Payment" p
SET "receiptNo" = p."receiptNo" || '-R' || ranked.rn
FROM ranked
WHERE p.id = ranked.id AND ranked.rn > 1;

-- One receipt number per school (several payments may have none, e.g. pending ones).
CREATE UNIQUE INDEX "Payment_tenantId_receiptNo_key" ON "Payment"("tenantId", "receiptNo") WHERE "receiptNo" IS NOT NULL;

-- Seed each school's counter from the highest generated number already issued for that year (RCP-<CODE>-<YYYY>-<NNNN>[-Rn]).
-- Done before row-level security is enabled below, so the owner's insert is not filtered.
INSERT INTO "ReceiptCounter" ("tenantId", "year", "next")
SELECT "tenantId", year, MAX(seq) + 1
FROM (
  SELECT "tenantId",
         (regexp_match("receiptNo", '^RCP-[A-Z0-9]*-(\d{4})-(\d+)(?:-R\d+)?$'))[1]::int AS year,
         (regexp_match("receiptNo", '^RCP-[A-Z0-9]*-(\d{4})-(\d+)(?:-R\d+)?$'))[2]::int AS seq
  FROM "Payment"
  WHERE "receiptNo" ~ '^RCP-[A-Z0-9]*-\d{4}-\d+(-R\d+)?$'
) issued
GROUP BY "tenantId", year;

-- Row-Level Security
ALTER TABLE "ReceiptCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceiptCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_counter_read ON "ReceiptCounter" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY receipt_counter_insert ON "ReceiptCounter" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY receipt_counter_update ON "ReceiptCounter" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- No explicit grant: the runtime role receives new tables through the default privileges set in the first migration, and calling
-- app_grant_runtime_privileges() here would re-grant UPDATE/DELETE on the append-only audit tables (the RLS catalog tests catch that).
