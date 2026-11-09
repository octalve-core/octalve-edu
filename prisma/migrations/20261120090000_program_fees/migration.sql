-- Programs, slice P4 (task 0027; AlEemaan's task 0043, section 11): fees of a program - fee items, invoices, payments and discounts, in tables of their own. The school's Invoice and Payment tables
-- are NOT touched.
--
-- ADDITIVE ONLY: one column on Program (the program's own switch, default OFF), four enums, seven tables. The existing InvoiceStatus and PaymentStatus enums are reused. Nothing that exists is
-- changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI
-- session. Run it after 20261119090000_program_assessments.

-- CreateEnum
CREATE TYPE "ProgramFeeFrequency" AS ENUM ('ONCE', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ProgramFeeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramFeeBilledTo" AS ENUM ('PARTICIPANT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "ProgramPaymentSource" AS ENUM ('MANUAL', 'GATEWAY');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "feesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProgramFeeItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "ProgramFeeFrequency" NOT NULL DEFAULT 'ONCE',
    "dueDay" INTEGER,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "discountPercent" DECIMAL(5,2),
    "billedTo" "ProgramFeeBilledTo" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "ProgramFeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramFeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramFeeExemption" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "feeItemId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramFeeExemption_pkey" PRIMARY KEY ("feeItemId","participantId")
);

-- CreateTable
CREATE TABLE "ProgramInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "campusId" TEXT,
    "participantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATE,
    "payInFull" BOOLEAN NOT NULL DEFAULT false,
    "lineItems" JSONB NOT NULL,
    "billingName" TEXT,
    "billingPhone" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "campusId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" "ProgramPaymentSource" NOT NULL DEFAULT 'MANUAL',
    "providerRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedServerSide" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "paidAt" TIMESTAMP(3),
    "receiptNo" TEXT,
    "metadata" JSONB,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramInvoiceDiscount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramInvoiceDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCounter" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramCounter_pkey" PRIMARY KEY ("tenantId","kind","year")
);

-- CreateIndex
CREATE INDEX "ProgramFeeItem_tenantId_programId_status_idx" ON "ProgramFeeItem"("tenantId", "programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramFeeItem_tenantId_id_key" ON "ProgramFeeItem"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramFeeItem_tenantId_programId_id_key" ON "ProgramFeeItem"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "ProgramFeeExemption_tenantId_participantId_idx" ON "ProgramFeeExemption"("tenantId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramInvoice_tenantId_programId_campusId_status_idx" ON "ProgramInvoice"("tenantId", "programId", "campusId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramInvoice_tenantId_invoiceNo_key" ON "ProgramInvoice"("tenantId", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramInvoice_tenantId_id_key" ON "ProgramInvoice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramInvoice_tenantId_programId_id_key" ON "ProgramInvoice"("tenantId", "programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramInvoice_programId_participantId_periodKey_key" ON "ProgramInvoice"("programId", "participantId", "periodKey");

-- CreateIndex
CREATE INDEX "ProgramPayment_tenantId_programId_invoiceId_idx" ON "ProgramPayment"("tenantId", "programId", "invoiceId");

-- CreateIndex
CREATE INDEX "ProgramPayment_tenantId_programId_campusId_status_idx" ON "ProgramPayment"("tenantId", "programId", "campusId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPayment_tenantId_source_providerRef_key" ON "ProgramPayment"("tenantId", "source", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPayment_tenantId_receiptNo_key" ON "ProgramPayment"("tenantId", "receiptNo");

-- CreateIndex
CREATE INDEX "ProgramInvoiceDiscount_tenantId_programId_invoiceId_idx" ON "ProgramInvoiceDiscount"("tenantId", "programId", "invoiceId");

-- AddForeignKey
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFeeExemption" ADD CONSTRAINT "ProgramFeeExemption_tenantId_programId_feeItemId_fkey" FOREIGN KEY ("tenantId", "programId", "feeItemId") REFERENCES "ProgramFeeItem"("tenantId", "programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFeeExemption" ADD CONSTRAINT "ProgramFeeExemption_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPayment" ADD CONSTRAINT "ProgramPayment_tenantId_programId_invoiceId_fkey" FOREIGN KEY ("tenantId", "programId", "invoiceId") REFERENCES "ProgramInvoice"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_tenantId_programId_invoiceId_fkey" FOREIGN KEY ("tenantId", "programId", "invoiceId") REFERENCES "ProgramInvoice"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_name_check" CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name"));
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_amount_check" CHECK ("amount" >= 0.01 AND "amount" <= 10000000);
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_dueDay_check" CHECK ("dueDay" IS NULL OR "dueDay" BETWEEN 1 AND 28);
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_discount_check" CHECK ("discountPercent" IS NULL OR ("discountPercent" >= 0 AND "discountPercent" <= 100));
ALTER TABLE "ProgramFeeItem" ADD CONSTRAINT "ProgramFeeItem_audience_check" CHECK (jsonb_typeof("audience") = 'object');
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_period_check" CHECK ("periodKey" ~ '^(once|[0-9]{4}|[0-9]{4}-(0[1-9]|1[0-2]))$');
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_amounts_check" CHECK ("totalAmount" >= 0 AND "amountPaid" >= 0 AND "amountPaid" <= "totalAmount");
ALTER TABLE "ProgramInvoice" ADD CONSTRAINT "ProgramInvoice_lines_check" CHECK (jsonb_typeof("lineItems") = 'array');
ALTER TABLE "ProgramPayment" ADD CONSTRAINT "ProgramPayment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ProgramInvoiceDiscount" ADD CONSTRAINT "ProgramInvoiceDiscount_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500);

-- Row-level security on every new table, in the same shape as the other program tables.
ALTER TABLE "ProgramFeeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramFeeItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_fee_item_read ON "ProgramFeeItem" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_item_insert ON "ProgramFeeItem" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_item_update ON "ProgramFeeItem" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_item_delete ON "ProgramFeeItem" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramFeeExemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramFeeExemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_fee_exemption_read ON "ProgramFeeExemption" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_exemption_insert ON "ProgramFeeExemption" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_exemption_update ON "ProgramFeeExemption" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_fee_exemption_delete ON "ProgramFeeExemption" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_invoice_read ON "ProgramInvoice" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_insert ON "ProgramInvoice" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_update ON "ProgramInvoice" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_delete ON "ProgramInvoice" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_payment_read ON "ProgramPayment" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_payment_insert ON "ProgramPayment" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_payment_update ON "ProgramPayment" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_payment_delete ON "ProgramPayment" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramInvoiceDiscount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramInvoiceDiscount" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_invoice_discount_read ON "ProgramInvoiceDiscount" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_discount_insert ON "ProgramInvoiceDiscount" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_discount_update ON "ProgramInvoiceDiscount" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_invoice_discount_delete ON "ProgramInvoiceDiscount" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_counter_read ON "ProgramCounter" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_counter_insert ON "ProgramCounter" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_counter_update ON "ProgramCounter" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_counter_delete ON "ProgramCounter" FOR DELETE USING ("tenantId" = app_tenant_id());
