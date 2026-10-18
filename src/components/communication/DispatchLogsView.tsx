"use client";

import { useState } from "react";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EyeIcon, RefreshCwIcon } from "@/components/ui/icons";
import { useApi } from "@/components/academics/useApi";
import { sendJson } from "@/components/auth/postJson";
import type { DispatchListItem } from "@/lib/communication/service";

interface DispatchLogsViewProps {
  schoolCode: string;
}

export function DispatchLogsView({ schoolCode }: DispatchLogsViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [searchRecipient, setSearchRecipient] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const [selectedDispatch, setSelectedDispatch] = useState<DispatchListItem | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Build query string
  const queryParams = new URLSearchParams();
  if (statusFilter !== "ALL") queryParams.set("status", statusFilter);
  if (channelFilter !== "ALL") queryParams.set("channel", channelFilter);
  if (searchRecipient.trim()) queryParams.set("recipient", searchRecipient.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", "25");

  const { reply, loading, error, reload } = useApi(`/api/v1/schools/${schoolCode}/communication/dispatches?${queryParams.toString()}`);

  const dispatches = (reply?.data as unknown as DispatchListItem[]) ?? [];
  const meta = reply?.meta as { total?: number; totalPages?: number; page?: number } | undefined;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const handleRetry = async (dispatchId: string) => {
    setRetryingId(dispatchId);
    setActionError(null);
    setActionSuccess(null);

    const res = await sendJson(`/api/v1/schools/${schoolCode}/communication/dispatches/${dispatchId}/retry`, "POST");

    setRetryingId(null);

    if (!res.ok) {
      setActionError(res.message || "Failed to retry dispatch.");
      return;
    }

    setActionSuccess("Dispatch queued for retry.");
    await reload(true);
  };

  const statusBadge = (status: NotificationDispatchStatus) => {
    switch (status) {
      case NotificationDispatchStatus.SENT:
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            Sent
          </span>
        );
      case NotificationDispatchStatus.FAILED:
        return (
          <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
            Failed
          </span>
        );
      case NotificationDispatchStatus.PROCESSING:
        return (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            Processing
          </span>
        );
      case NotificationDispatchStatus.RETRYING:
        return (
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
            Retrying
          </span>
        );
      case NotificationDispatchStatus.QUEUED:
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Queued
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {actionSuccess && (
        <Alert variant="success">
          <span>{actionSuccess}</span>
        </Alert>
      )}

      {actionError && (
        <Alert variant="error">
          <span>{actionError}</span>
        </Alert>
      )}

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {["ALL", "SENT", "QUEUED", "PROCESSING", "RETRYING", "FAILED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === st ? "bg-brand text-white shadow-sm" : "bg-surface-2 text-fg-2 hover:bg-surface-2/80 hover:text-fg"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="dispatch-channel-filter" className="sr-only">
            Filter by channel
          </label>
          <select
            id="dispatch-channel-filter"
            value={channelFilter}
            aria-label="Filter by channel"
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-fg focus:border-brand-strong focus:outline-none"
          >
            <option value="ALL">All Channels</option>
            <option value={NotificationChannel.EMAIL}>Email</option>
            <option value={NotificationChannel.SMS}>SMS</option>
            <option value={NotificationChannel.WHATSAPP}>WhatsApp</option>
            <option value={NotificationChannel.IN_APP}>In-App</option>
          </select>

          <label htmlFor="dispatch-recipient-filter" className="sr-only">
            Search recipient address or phone
          </label>
          <input
            id="dispatch-recipient-filter"
            type="search"
            aria-label="Search recipient address or phone"
            placeholder="Search address/phone..."
            value={searchRecipient}
            onChange={(e) => {
              setSearchRecipient(e.target.value);
              setPage(1);
            }}
            className="w-48 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div
          tabIndex={0}
          role="region"
          aria-label="Delivery logs table"
          className="overflow-x-auto focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/60 text-fg-muted uppercase tracking-wider font-semibold">
              <tr>
                <th scope="col" role="columnheader" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3">
                  Channel
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3">
                  Recipient
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3">
                  Message Snippet
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3 text-center">
                  Attempts
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3">
                  Date
                </th>
                <th scope="col" role="columnheader" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-fg">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-fg-muted">
                    Loading delivery logs...
                  </td>
                </tr>
              )}

              {!loading && dispatches.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-fg-muted">
                    No communication dispatches found matching filters.
                  </td>
                </tr>
              )}

              {!loading &&
                dispatches.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-surface-2/40">
                    <td className="px-4 py-3 whitespace-nowrap">{statusBadge(d.status)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-fg">{d.channel}</span>
                    </td>
                    <td className="px-4 py-3 font-mono">{d.recipientAddress}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-fg-muted">
                      {d.subject ? `${d.subject}: ` : ""}
                      {d.body}
                    </td>
                    <td className="px-4 py-3 text-center">{d.attempts}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                      {new Date(d.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          className="min-h-8 px-2 py-1 text-xs"
                          onClick={() => setSelectedDispatch(d)}
                          title="View diagnostic details"
                        >
                          <EyeIcon className="h-3.5 w-3.5" />
                        </Button>
                        {d.status === NotificationDispatchStatus.FAILED && (
                          <Button
                            variant="primary"
                            className="min-h-8 px-2 py-1 text-xs"
                            loading={retryingId === d.id}
                            onClick={() => handleRetry(d.id)}
                            title="Retry dispatch"
                          >
                            <RefreshCwIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-fg-muted">
          <span>
            Showing {dispatches.length} of {total} records
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="min-h-8 px-3 py-1 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-medium text-fg">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              className="min-h-8 px-3 py-1 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Diagnostics Modal */}
      <Dialog
        open={Boolean(selectedDispatch)}
        onClose={() => setSelectedDispatch(null)}
        title="Dispatch Diagnostic Details"
        description="Delivery payload, recipient address, and error diagnostics."
      >
        {selectedDispatch && (
          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-3">
              <div>
                <span className="font-semibold text-fg">Dispatch ID:</span>
                <p className="font-mono text-fg-muted">{selectedDispatch.id}</p>
              </div>
              <div>
                <span className="font-semibold text-fg">Status:</span>
                <div className="mt-0.5">{statusBadge(selectedDispatch.status)}</div>
              </div>
              <div>
                <span className="font-semibold text-fg">Channel:</span>
                <p className="text-fg-muted">{selectedDispatch.channel}</p>
              </div>
              <div>
                <span className="font-semibold text-fg">Recipient:</span>
                <p className="font-mono text-fg-muted">{selectedDispatch.recipientAddress}</p>
              </div>
              <div>
                <span className="font-semibold text-fg">Attempts:</span>
                <p className="text-fg-muted">{selectedDispatch.attempts}</p>
              </div>
              <div>
                <span className="font-semibold text-fg">Created:</span>
                <p className="text-fg-muted">{new Date(selectedDispatch.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {selectedDispatch.lastError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                <span className="font-semibold">Failure Diagnostic:</span>
                <p className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{selectedDispatch.lastError}</p>
              </div>
            )}

            <div>
              <span className="font-semibold text-fg">Message Content:</span>
              <div className="mt-1 rounded-xl border border-line bg-canvas p-3 font-mono text-fg whitespace-pre-wrap">
                {selectedDispatch.subject && <p className="mb-2 font-bold text-fg">Subject: {selectedDispatch.subject}</p>}
                {selectedDispatch.body}
              </div>
            </div>

            {selectedDispatch.metadata && (
              <div>
                <span className="font-semibold text-fg">Metadata:</span>
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label="Dispatch metadata JSON"
                  className="mt-1 overflow-x-auto rounded-xl border border-line bg-canvas p-2.5 font-mono text-[10px] text-fg-muted focus:outline-none"
                >
                  {JSON.stringify(selectedDispatch.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              {selectedDispatch.status === NotificationDispatchStatus.FAILED && (
                <Button
                  variant="primary"
                  onClick={async () => {
                    await handleRetry(selectedDispatch.id);
                    setSelectedDispatch(null);
                  }}
                >
                  <RefreshCwIcon className="h-3.5 w-3.5 mr-1.5" />
                  Retry Dispatch
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSelectedDispatch(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
