"use client";

import { useId, useMemo, useState } from "react";
import { NotificationChannel } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { InfoIcon, MailIcon, MessageSquareIcon, SendIcon } from "@/components/ui/icons";
import { sendJson } from "@/components/auth/postJson";

interface CampusOption {
  id: string;
  name: string;
}

interface ClassArmOption {
  id: string;
  name: string;
  classGroup: { name: string };
}

interface BroadcastComposerProps {
  schoolCode: string;
  campuses: CampusOption[];
  classArms: ClassArmOption[];
  onBroadcastSent?: () => void;
}

const COMMON_TOKENS = [
  { token: "{{student_name}}", label: "Student Name", sample: "Tariq Nasir" },
  { token: "{{class_arm}}", label: "Class Arm", sample: "Primary 4 Gold" },
  { token: "{{school_name}}", label: "School Name", sample: "Octalve Academy" },
  { token: "{{date}}", label: "Today's Date", sample: "16 Oct 2026" },
];

export function BroadcastComposer({ schoolCode, campuses, classArms, onBroadcastSent }: BroadcastComposerProps) {
  const [channel, setChannel] = useState<NotificationChannel>(NotificationChannel.EMAIL);
  const [audienceRole, setAudienceRole] = useState<"ALL" | "GUARDIAN" | "STAFF">("ALL");
  const [campusId, setCampusId] = useState<string>("");
  const [classArmId, setClassArmId] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const bodyId = useId();

  // Character and segment calculation
  const charCount = body.length;
  const smsSegments = charCount === 0 ? 0 : Math.ceil(charCount / 160);

  // Live preview with token interpolation
  const previewBody = useMemo(() => {
    let text = body;
    for (const t of COMMON_TOKENS) {
      text = text.replaceAll(t.token, t.sample);
    }
    return text;
  }, [body]);

  const previewSubject = useMemo(() => {
    let text = subject;
    for (const t of COMMON_TOKENS) {
      text = text.replaceAll(t.token, t.sample);
    }
    return text;
  }, [subject]);

  const insertToken = (token: string) => {
    setBody((prev) => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + token + " ");
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    setSuccess(null);

    const payload = {
      channel,
      audienceRole,
      campusId: campusId || undefined,
      classArmId: classArmId || undefined,
      subject: channel === NotificationChannel.EMAIL ? subject : undefined,
      body,
    };

    const res = await sendJson(`/api/v1/schools/${schoolCode}/communication/broadcast`, "POST", payload);

    setSending(false);
    setConfirmOpen(false);

    if (!res.ok) {
      setError(res.message || "Failed to dispatch broadcast. Check inputs and try again.");
      return;
    }

    const data = res.data as { count?: number; channel?: NotificationChannel } | undefined;
    const count = data?.count ?? 0;
    setSuccess(`Broadcast queued successfully for ${count} recipient${count === 1 ? "" : "s"} via ${channel}.`);
    setBody("");
    setSubject("");
    onBroadcastSent?.();
  };

  return (
    <div className="space-y-6">
      {success && (
        <Alert variant="success">
          <span>{success}</span>
        </Alert>
      )}

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Form: 7 cols */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm lg:col-span-7">
          <h2 className="text-lg font-semibold text-fg">Compose Broadcast</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Send an instant notification across multiple communication gateways to guardians, staff, or the whole school community.
          </p>

          <div className="mt-6 space-y-5">
            {/* Channel Selection Buttons */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">Delivery Channel</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { ch: NotificationChannel.EMAIL, label: "Email", icon: MailIcon },
                  { ch: NotificationChannel.SMS, label: "SMS", icon: MessageSquareIcon },
                  { ch: NotificationChannel.WHATSAPP, label: "WhatsApp", icon: MessageSquareIcon },
                  { ch: NotificationChannel.IN_APP, label: "In-App", icon: InfoIcon },
                ].map(({ ch, label, icon: Icon }) => {
                  const selected = channel === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                        selected
                          ? "border-brand-strong bg-brand-tint text-brand-fg shadow-sm ring-1 ring-brand-strong"
                          : "border-line bg-surface-2/40 text-fg-2 hover:bg-surface-2"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Audience Controls */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SelectField
                label="Target Group"
                value={audienceRole}
                options={[
                  { value: "ALL", label: "All Community" },
                  { value: "GUARDIAN", label: "Parents / Guardians" },
                  { value: "STAFF", label: "Staff Members" },
                ]}
                onChange={(e) => setAudienceRole(e.target.value as "ALL" | "GUARDIAN" | "STAFF")}
              />

              <SelectField
                label="Campus Scope"
                value={campusId}
                options={[{ value: "", label: "All Campuses" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]}
                onChange={(e) => setCampusId(e.target.value)}
              />

              <SelectField
                label="Class Arm"
                value={classArmId}
                options={[
                  { value: "", label: "All Classes" },
                  ...classArms.map((arm) => ({
                    value: arm.id,
                    label: `${arm.classGroup.name} - ${arm.name}`,
                  })),
                ]}
                onChange={(e) => setClassArmId(e.target.value)}
              />
            </div>

            {/* Subject (for EMAIL) */}
            {channel === NotificationChannel.EMAIL && (
              <TextField
                label="Email Subject"
                placeholder="e.g. End of Term Arrangements & Excursion Notice"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            )}

            {/* Message Body */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor={bodyId} className="block text-sm font-medium text-fg">
                  Message Content
                </label>
                {channel === NotificationChannel.SMS && (
                  <span className="text-xs font-medium text-fg-muted">
                    {charCount} / 160 chars ({smsSegments} segment{smsSegments === 1 ? "" : "s"})
                  </span>
                )}
              </div>
              <textarea
                id={bodyId}
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your broadcast message here. Use tokens below for dynamic personalization..."
                className="mt-1.5 block w-full rounded-xl border border-line bg-canvas p-3 text-sm text-fg placeholder:text-fg-muted focus:border-brand-strong focus:ring-1 focus:ring-brand-strong focus:outline-none"
                required
              />
            </div>

            {/* Token Chips */}
            <div>
              <span className="text-xs font-semibold text-fg-muted">Available Dynamic Tokens:</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {COMMON_TOKENS.map(({ token, label }) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertToken(token)}
                    className="inline-flex items-center rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:border-brand-strong hover:text-brand-fg"
                    title={`Insert ${label}`}
                  >
                    + {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Bar */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setBody("");
                  setSubject("");
                }}
                disabled={!body && !subject}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                type="button"
                disabled={!body.trim() || (channel === NotificationChannel.EMAIL && !subject.trim())}
                onClick={() => setConfirmOpen(true)}
              >
                <SendIcon className="h-4 w-4 mr-1.5" />
                Dispatch Broadcast
              </Button>
            </div>
          </div>
        </div>

        {/* Right Preview: 5 cols */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-sm font-semibold text-fg">Live Gateway Preview</h3>
            <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-fg uppercase">{channel}</span>
          </div>

          <div className="mt-4">
            {channel === NotificationChannel.EMAIL ? (
              <div className="rounded-xl border border-line bg-canvas p-4 text-sm shadow-inner">
                <div className="border-b border-line pb-2.5 text-xs text-fg-muted">
                  <p>
                    <span className="font-semibold text-fg">To:</span> Selected Audience ({audienceRole})
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-fg">Subject:</span> {previewSubject || "(No subject set)"}
                  </p>
                </div>
                <div className="mt-3 min-h-36 whitespace-pre-wrap text-fg">
                  {previewBody || <span className="italic text-fg-muted">Message body preview appears here...</span>}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-xs rounded-2xl border-4 border-line bg-canvas p-3 shadow-md">
                <div className="mb-2 text-center text-[11px] font-semibold text-fg-muted">
                  {channel === NotificationChannel.WHATSAPP ? "WhatsApp Message" : "SMS Text Message"}
                </div>
                <div className="rounded-2xl bg-brand-tint p-3 text-xs text-fg shadow-sm">
                  <p className="whitespace-pre-wrap">
                    {previewBody || <span className="italic text-fg-muted">Message preview appears here...</span>}
                  </p>
                  <div className="mt-1.5 text-right text-[10px] text-fg-muted">Just now</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-line/60 bg-surface-2/50 p-3.5 text-xs text-fg-muted">
            <p className="font-semibold text-fg">Delivery Diagnostics Note</p>
            <p className="mt-1">
              Dispatches are processed asynchronously through Redis BullMQ queues. Nigerian phone numbers are normalized to E.164 (+234)
              automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm School Broadcast"
        description="Are you sure you want to send this broadcast to the selected audience?"
      >
        <div className="space-y-3 py-2 text-sm text-fg">
          <p>
            <strong>Channel:</strong> {channel}
          </p>
          <p>
            <strong>Audience:</strong> {audienceRole}
            {campusId ? ` (Campus: ${campuses.find((c) => c.id === campusId)?.name})` : " (All Campuses)"}
            {classArmId ? ` (Class: ${classArms.find((a) => a.id === classArmId)?.name})` : ""}
          </p>
          {channel === NotificationChannel.EMAIL && (
            <p>
              <strong>Subject:</strong> {subject}
            </p>
          )}
          <div className="rounded-lg border border-line bg-surface-2 p-2.5 text-xs">
            <p className="line-clamp-3 text-fg-muted">{body}</p>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSend} loading={sending}>
              Confirm & Send
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
