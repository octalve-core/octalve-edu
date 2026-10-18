"use client";

import { useState, useEffect } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { ExternalLinkIcon, LinkIcon, RefreshCwIcon, QrCodeIcon } from "@/components/ui/icons";
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

interface PaymentInitResult {
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
}

export function PaymentLinkTool({ schoolCode }: { schoolCode?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentResult, setPaymentResult] = useState<PaymentInitResult | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visibleStudents = searchQuery.trim().length >= 2 ? students : [];

  // Search students with debounce
  useEffect(() => {
    if (!schoolCode || searchQuery.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getJson(`/api/v1/schools/${schoolCode}/people/students?q=${encodeURIComponent(searchQuery.trim())}&status=live`);
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
    getJson(`/api/v1/schools/${schoolCode}/finance/invoices?studentId=${selectedStudent.id}`)
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
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingInvoices(false);
      });

    return () => {
      active = false;
    };
  }, [selectedStudent, schoolCode]);

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode || !selectedInvoice) return;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please specify a valid payment amount greater than zero.");
      return;
    }

    setError(null);
    setGenerating(true);

    try {
      const res = await sendJson(`/api/v1/schools/${schoolCode}/finance/invoices/${selectedInvoice.id}/pay`, "POST", {
        amount: parsedAmount,
      });

      if (!res.ok) {
        setError(res.message || "Failed to initialize payment gateway link.");
        setGenerating(false);
        return;
      }

      const initData = res.data as unknown as PaymentInitResult;
      setPaymentResult(initData);

      // Generate QR Code dynamically
      const qrcodeMod = await import("qrcode");
      const qrData = await (qrcodeMod.default ?? qrcodeMod).toDataURL(initData.authorizationUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 220,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrCodeDataUrl(qrData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating checkout link.");
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    if (!paymentResult?.authorizationUrl) return;
    try {
      await navigator.clipboard.writeText(paymentResult.authorizationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const resetAll = () => {
    setSelectedStudent(null);
    setSelectedInvoice(null);
    setInvoices([]);
    setStudents([]);
    setSearchQuery("");
    setAmount("");
    setPaymentResult(null);
    setQrCodeDataUrl(null);
    setError(null);
    setCopied(false);
  };

  if (!schoolCode) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-fg-muted">
        Select or navigate into a school context to generate payment links.
      </div>
    );
  }

  // Generated Result View (QR Code + Link Sharing)
  if (paymentResult && qrCodeDataUrl) {
    const parentShareMessage = `Hello, here is the secure fee payment link for ${selectedStudent?.name} (${selectedInvoice?.invoiceNo}): ${paymentResult.authorizationUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(parentShareMessage)}`;

    return (
      <div className="space-y-4 py-2">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
            <QrCodeIcon className="h-5 w-5" />
          </div>
          <h3 className="mt-2 text-sm font-bold text-fg">Payment Link & QR Ready</h3>
          <p className="text-[11px] text-fg-muted">Scan to pay instantly on mobile or share the link with the guardian.</p>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-4 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCodeDataUrl}
            alt="Scan QR Code to pay fee"
            className="h-44 w-44 rounded-xl border border-line/60 bg-white p-2 shadow-xs"
          />
          <p className="mt-2 text-[10px] text-fg-muted font-mono">Ref: {paymentResult.reference}</p>
          <p className="text-xs font-bold text-fg mt-1">
            Amount: ₦{Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Copyable Link Field */}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2.5">
          <LinkIcon className="h-4 w-4 shrink-0 text-fg-muted" />
          <input
            type="text"
            readOnly
            value={paymentResult.authorizationUrl}
            className="w-full bg-transparent text-xs text-fg focus:outline-none font-mono truncate"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-fg hover:bg-surface hover:text-brand transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <span>Share WhatsApp</span>
          </a>
          <a
            href={paymentResult.authorizationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            <span>Open Checkout</span>
          </a>
        </div>

        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={resetAll} className="flex items-center gap-1.5 text-xs">
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span>Generate Another Link</span>
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
            <label htmlFor="payment-link-student-search" className="sr-only">
              Search student for payment link
            </label>
            <input
              id="payment-link-student-search"
              type="search"
              placeholder="Search student by name or admission #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
              autoFocus
            />
            {searching && <span className="absolute right-3 top-3 text-[11px] text-fg-muted">Searching...</span>}
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
                  {s.campusName && <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">{s.campusName}</span>}
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
        /* Step 2: Invoice Selection and Amount Configuration */
        <form onSubmit={handleGenerateLink} className="space-y-4">
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

              {/* Amount to Pay */}
              <div>
                <label htmlFor="payment-link-amount" className="block text-xs font-semibold text-fg mb-1">
                  Amount to Pay (₦)
                </label>
                <input
                  id="payment-link-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-fg font-mono focus:border-brand-strong focus:outline-none"
                  placeholder="e.g. 50000"
                  required
                />
                {selectedInvoice && (
                  <p className="mt-1 text-[11px] text-fg-muted">Total invoice balance: ₦{selectedInvoice.balance.toLocaleString()}</p>
                )}
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full justify-center text-xs font-semibold flex items-center gap-2"
                  disabled={generating || !selectedInvoice}
                >
                  <QrCodeIcon className="h-4 w-4" />
                  <span>{generating ? "Generating..." : "Generate Payment Link & QR"}</span>
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
