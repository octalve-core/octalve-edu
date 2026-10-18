"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { CheckCircle2Icon, MegaphoneIcon, RefreshCwIcon } from "@/components/ui/icons";
import { sendJson } from "@/components/auth/postJson";

interface QuickBroadcastToolProps {
  schoolCode?: string;
}

const URGENCY_PRESETS = [
  {
    title: "Weather / Early Closure",
    body: "Notice: Due to severe weather conditions, school will dismiss early today at 1:00 PM. School buses will depart promptly. Please ensure pickup.",
  },
  {
    title: "Emergency PTA Meeting",
    body: "Urgent Reminder: An emergency Parents-Teachers consultation will hold tomorrow at 10:00 AM in the school main hall. Attendance is mandatory.",
  },
  {
    title: "Fee Payment Deadline",
    body: "Important: School tuition and term fees deadline is approaching. Please settle outstanding balances to ensure uninterrupted academic access.",
  },
  {
    title: "Mid-Term Break",
    body: "Reminder: Mid-term break commences this Friday. School will resume regular academic sessions next Tuesday. Have a restful break.",
  },
];

export function QuickBroadcastTool({ schoolCode }: QuickBroadcastToolProps) {
  const [channel, setChannel] = useState<"SMS" | "WHATSAPP" | "EMAIL" | "IN_APP">("SMS");
  const [audienceRole, setAudienceRole] = useState<"ALL" | "GUARDIAN" | "STAFF" | "STUDENT">("GUARDIAN");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ count?: number } | null>(null);

  const charCount = body.length;
  const smsSegments = Math.max(1, Math.ceil(charCount / 160));

  const handleApplyPreset = (presetBody: string) => {
    setBody(presetBody);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode) return;

    if (!body.trim()) {
      setError("Please compose your broadcast message before sending.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        channel,
        audienceRole,
        subject: channel === "EMAIL" ? subject.trim() || "Urgent School Announcement" : undefined,
        body: body.trim(),
      };

      const res = await sendJson(`/api/v1/schools/${schoolCode}/communication/broadcast`, "POST", payload);

      if (!res.ok) {
        setError(res.message || "Failed to dispatch broadcast.");
        setSubmitting(false);
        return;
      }

      const data = res.data as { dispatches?: unknown[] } | undefined;
      setSuccessResult({ count: data?.dispatches?.length ?? 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error dispatching broadcast.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setBody("");
    setSubject("");
    setSuccessResult(null);
    setError(null);
  };

  if (!schoolCode) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-fg-muted">
        Select or navigate into a school context to dispatch quick announcements.
      </div>
    );
  }

  if (successResult) {
    return (
      <div className="space-y-4 py-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2Icon className="h-7 w-7" />
        </div>
        <div>
          <h3 className="text-base font-bold text-fg">Broadcast Dispatched</h3>
          <p className="mt-1 text-xs text-fg-muted">
            Your urgent {channel} announcement has been queued for {audienceRole.toLowerCase()} recipients.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-canvas p-4 text-xs text-left font-mono">
          <p className="text-fg-muted">
            Channel: <span className="font-semibold text-fg">{channel}</span>
          </p>
          <p className="text-fg-muted mt-1">
            Target: <span className="font-semibold text-fg">{audienceRole}</span>
          </p>
          <p className="text-fg-muted mt-1">
            Status: <span className="font-semibold text-emerald-600 dark:text-emerald-400">Enqueued in Delivery Bus</span>
          </p>
        </div>

        <div className="pt-2">
          <Button variant="secondary" onClick={resetForm} className="flex items-center gap-1.5 text-xs mx-auto">
            <RefreshCwIcon className="h-3.5 w-3.5" />
            <span>Send Another Alert</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* Channel and Audience Selectors */}
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Channel"
          value={channel}
          options={[
            { value: "SMS", label: "SMS Message" },
            { value: "WHATSAPP", label: "WhatsApp" },
            { value: "EMAIL", label: "Email" },
            { value: "IN_APP", label: "In-App Notice" },
          ]}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
        />

        <SelectField
          label="Audience"
          value={audienceRole}
          options={[
            { value: "GUARDIAN", label: "Guardians & Parents" },
            { value: "STAFF", label: "Teachers & Staff" },
            { value: "ALL", label: "Entire School Community" },
            { value: "STUDENT", label: "Students" },
          ]}
          onChange={(e) => setAudienceRole(e.target.value as typeof audienceRole)}
        />
      </div>

      {channel === "EMAIL" && (
        <div>
          <label htmlFor="broadcast-subject" className="block text-xs font-semibold text-fg mb-1">
            Subject Line
          </label>
          <input
            id="broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Urgent Notice: School Closing Early"
            className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-fg focus:border-brand-strong focus:outline-none"
            required
          />
        </div>
      )}

      {/* Quick Urgency Preset Chips */}
      <div>
        <span className="block text-[11px] font-medium text-fg-muted mb-1.5">Urgency Presets:</span>
        <div className="flex flex-wrap gap-1.5">
          {URGENCY_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => handleApplyPreset(p.body)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] text-fg hover:bg-surface-2 transition-colors"
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      {/* Message Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="broadcast-body" className="block text-xs font-semibold text-fg">
            Message Body
          </label>
          {channel === "SMS" && (
            <span className="text-[10px] font-mono text-fg-muted">
              {charCount} chars · {smsSegments} SMS page{smsSegments > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <textarea
          id="broadcast-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Compose quick urgent broadcast..."
          className="w-full rounded-xl border border-line bg-canvas p-3 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none resize-none"
          required
        />
      </div>

      <div className="pt-1">
        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center text-xs font-semibold flex items-center gap-2"
          disabled={submitting}
        >
          <MegaphoneIcon className="h-4 w-4" />
          <span>{submitting ? "Dispatching..." : `Send Urgent ${channel}`}</span>
        </Button>
      </div>
    </form>
  );
}
