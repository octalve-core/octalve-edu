"use client";

import { useState, useEffect } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { CheckCircle2Icon, ReceiptIcon, RefreshCwIcon } from "@/components/ui/icons";
import { getJson, sendJson } from "@/components/auth/postJson";

interface StudentApiItem {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string | null;
  campus?: { name: string } | null;
}

interface InvoiceApiItem {
  id: string;
  invoiceNo: string;
  period?: { name: string };
  total: number;
  balance: number;
  status: string;
}

interface StudentOption {
  id: string;
  name: string;
  admissionNo: string | null;
  campusName?: string;
}

interface InvoiceOption {
  id: string;
  invoiceNo: string;
  periodName: string;
  total: number;
  balance: number;
  status: string;
}

interface ReceiptSummary {
  paymentId: string;
  invoiceNo: string;
  amount: number;
  channel: string;
  receiptNo: string;
  newBalance: number;
  recordedAt: string;
}

export function PaymentRecorderTool({ schoolCode }: { schoolCode?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [channel, setChannel] = useState<"CASH" | "POS" | "BANK_TRANSFER">("CASH");
  const [receiptNo, setReceiptNo] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptSummary | null>(null);

  const visibleStudents = searchQuery.trim().length >= 2 ? students : [];

  // Search students with debounce
  useEffect(() => {
    if (!schoolCode || searchQuery.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getJson(
          `/api/v1/schools/${schoolCode}/people/students?q=${encodeURIComponent(searchQuery.trim())}&status=live`,
        );
        if (res.ok && res.data && typeof res.data === "object" && "students" in res.data) {
          const rawStudents = (res.data as { students: StudentApiItem[] }).students;
          setStudents(
            rawStudents.map((s) => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName}`,
              admissionNo: s.admissionNo,
              campusName: s.campus?.name,
            })),
          );
        }
      } catch {
        // Ignore network errors in search
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, schoolCode]);

  // Load unpaid invoices for selected student
  useEffect(() => {
    if (!schoolCode || !selectedStudent) {
      return;
    }

    let active = true;
    getJson(
      `/api/v1/schools/${schoolCode}/finance/invoices?studentId=${selectedStudent.id}`,
    )
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data && typeof res.data === "object" && "items" in res.data) {
          const rawItems = (res.data as { items: InvoiceApiItem[] }).items;
          const list = rawItems.map((i) => ({
            id: i.id,
            invoiceNo: i.invoiceNo,
            periodName: i.period?.name || "Term Invoice",
            total: i.total,
            balance: i.balance,
            status: i.status,
          }));
          setInvoices(list);
          const firstUnpaid = list.find((i) => i.balance > 0) || list[0];
          if (firstUnpaid) {
            setSelectedInvoice(firstUnpaid);
            setAmount(String(firstUnpaid.balance));
          }
        }
      })
      .catch(() => {
        // Ignore
      })
      .finally(() => {
        if (active) setLoadingInvoices(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStudent, schoolCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode || !selectedInvoice) return;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please enter a valid payment amount greater than zero.");
      return;
    }

    if (!receiptNo.trim()) {
      setError("Please provide a receipt or reference number (e.g. cash voucher or POS slip number).");
      return;
    }

    setError(null);
    setSubmitting(true);

    const payload = {
      amount: parsedAmount,
      channel,
      receiptNo: receiptNo.trim(),
      note: note.trim() || undefined,
    };

    const res = await sendJson(
      `/api/v1/schools/${schoolCode}/finance/invoices/${selectedInvoice.id}/manual-payment`,
      "POST",
      payload,
    );

    setSubmitting(false);

    if (!res.ok) {
      setError(res.message || "Failed to record manual payment.");
      return;
    }

    const data = res.data as { payment?: { id: string }; newBalance?: number } | undefined;

    setReceipt({
      paymentId: data?.payment?.id || Math.random().toString(36).substring(2, 9),
      invoiceNo: selectedInvoice.invoiceNo,
      amount: parsedAmount,
      channel,
      receiptNo: receiptNo.trim(),
      newBalance: data?.newBalance ?? Math.max(0, selectedInvoice.balance - parsedAmount),
      recordedAt: new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    });
  };

  const resetAll = () => {
    setSelectedStudent(null);
    setSelectedInvoice(null);
    setInvoices([]);
    setStudents([]);
    setSearchQuery("");
    setAmount("");
    setReceiptNo("");
    setNote("");
    setReceipt(null);
    setError(null);
  };

  if (!schoolCode) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-fg-muted">
        Select or navigate into a school context to record payments.
      </div>
    );
  }

  // Success Receipt State
  if (receipt) {
    return (
      <div className="space-y-5 py-2">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2Icon className="h-7 w-7" />
          </div>
          <h3 className="mt-3 text-base font-bold text-fg">Payment Recorded Successfully</h3>
          <p className="text-xs text-fg-muted">Receipt #{receipt.receiptNo} logged into school accounts.</p>
        </div>

        <div className="rounded-2xl border border-line bg-canvas p-4 text-xs space-y-2.5 font-mono">
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-fg-muted">Student:</span>
            <span className="font-semibold text-fg">{selectedStudent?.name}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-fg-muted">Invoice:</span>
            <span className="text-fg">{receipt.invoiceNo}</span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-fg-muted">Amount Paid:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              ₦ {receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between border-b border-line pb-2">
            <span className="text-fg-muted">Payment Method:</span>
            <span className="text-fg">{receipt.channel}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-fg-muted">Remaining Balance:</span>
            <span className="font-semibold text-fg">
              ₦ {receipt.newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={resetAll} className="flex items-center gap-1.5 text-xs">
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span>Record Another</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs"
          >
            <ReceiptIcon className="h-3.5 w-3.5" />
            <span>Print Receipt</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* Step 1: Student Lookup */}
      {!selectedStudent ? (
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="student-search-input" className="sr-only">
              Search student by name or admission number
            </label>
            <input
              id="student-search-input"
              type="search"
              placeholder="Search student by name or admission #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
              autoFocus
            />
            {searching && (
              <span className="absolute right-3 top-3 text-[11px] text-fg-muted">Searching...</span>
            )}
          </div>

          {visibleStudents.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-surface divide-y divide-line shadow-sm">
              {visibleStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStudent(s);
                    setInvoices([]);
                    setSelectedInvoice(null);
                    setLoadingInvoices(true);
                  }}
                  className="flex w-full items-center justify-between p-3 text-left text-xs transition-colors hover:bg-surface-2/60"
                >
                  <div>
                    <p className="font-semibold text-fg">{s.name}</p>
                    {s.admissionNo && <p className="text-[11px] font-mono text-fg-muted">{s.admissionNo}</p>}
                  </div>
                  {s.campusName && (
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">
                      {s.campusName}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && !searching && visibleStudents.length === 0 && (
            <div className="rounded-xl border border-line bg-surface p-6 text-center text-xs text-fg-muted">
              No students found matching &quot;{searchQuery}&quot;.
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Payment Entry for Selected Student */
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-xs">
            <div>
              <p className="font-bold text-fg">{selectedStudent.name}</p>
              <p className="text-[11px] font-mono text-fg-muted">
                {selectedStudent.admissionNo || "No admission #"} {selectedStudent.campusName ? `· ${selectedStudent.campusName}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedStudent(null);
                setSelectedInvoice(null);
                setInvoices([]);
              }}
              className="text-xs text-brand hover:underline"
            >
              Change
            </button>
          </div>

          {loadingInvoices ? (
            <div className="py-6 text-center text-xs text-fg-muted">Loading student invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-4 text-center text-xs text-fg-muted">
              No invoices found for this student.
            </div>
          ) : (
            <>
              {/* Select Invoice */}
              <div>
                <SelectField
                  label="Select Invoice"
                  value={selectedInvoice?.id || ""}
                  options={invoices.map((inv) => ({
                    value: inv.id,
                    label: `${inv.periodName} (${inv.invoiceNo}) — ₦${inv.balance.toLocaleString()} due`,
                  }))}
                  onChange={(e) => {
                    const found = invoices.find((inv) => inv.id === e.target.value);
                    if (found) {
                      setSelectedInvoice(found);
                      setAmount(String(found.balance));
                    }
                  }}
                />
              </div>

              {/* Amount & Method */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Payment Amount (₦)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />

                <SelectField
                  label="Payment Channel"
                  value={channel}
                  options={[
                    { value: "CASH", label: "Cash" },
                    { value: "POS", label: "POS Terminal" },
                    { value: "BANK_TRANSFER", label: "Direct Bank Transfer" },
                  ]}
                  onChange={(e) => setChannel(e.target.value as "CASH" | "POS" | "BANK_TRANSFER")}
                />
              </div>

              {/* Receipt No / Slip Ref */}
              <TextField
                label="Receipt / Reference Number"
                placeholder="e.g. POS-98421 or CASH-002"
                required
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
              />

              {/* Optional Notes */}
              <TextField
                label="Payment Note (Optional)"
                placeholder="e.g. Paid by father in bursary"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedStudent(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={submitting}>
                  Record ₦{Number(amount || 0).toLocaleString()} Payment
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
