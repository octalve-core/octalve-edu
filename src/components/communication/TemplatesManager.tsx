"use client";

import { useId, useMemo, useState } from "react";
import { NotificationChannel } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { EyeIcon, PencilIcon } from "@/components/ui/icons";
import { useApi } from "@/components/academics/useApi";
import { sendJson } from "@/components/auth/postJson";
import type { TemplateListItem } from "@/lib/communication/service";

interface TemplatesManagerProps {
  schoolCode: string;
}

const SAMPLE_DATA: Record<string, string> = {
  student_name: "Tariq Nasir",
  class_arm: "Primary 4 Gold",
  term_name: "First Term 2026/2027",
  date: "16 Oct 2026",
  school_name: "Octalve Academy",
  magic_link: "https://octalve.school/verify/magic-token-demo",
  invoice_number: "INV-2026-0012",
  amount_formatted: "₦85,000.00",
};

export function TemplatesManager({ schoolCode }: TemplatesManagerProps) {
  const { reply, loading, error, reload } = useApi(`/api/v1/schools/${schoolCode}/communication/templates`);
  const [selectedChannel, setSelectedChannel] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const [editingTemplate, setEditingTemplate] = useState<TemplateListItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [previewTemplate, setPreviewTemplate] = useState<TemplateListItem | null>(null);

  const editBodyId = useId();

  const filtered = useMemo(() => {
    const list = (reply?.data as unknown as TemplateListItem[]) ?? [];
    return list.filter((t) => {
      const matchesChannel = selectedChannel === "ALL" || t.channel === selectedChannel;
      const matchesSearch =
        search.trim() === "" || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase());
      return matchesChannel && matchesSearch;
    });
  }, [reply?.data, selectedChannel, search]);

  const handleOpenEdit = (t: TemplateListItem) => {
    setEditingTemplate(t);
    setEditName(t.name);
    setEditSubject(t.subjectTemplate || "");
    setEditBody(t.bodyTemplate);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTemplate) return;
    setSaving(true);
    setSaveError(null);

    const payload = {
      name: editName,
      subjectTemplate: editingTemplate.channel === NotificationChannel.EMAIL ? editSubject : null,
      bodyTemplate: editBody,
    };

    const res = await sendJson(`/api/v1/schools/${schoolCode}/communication/templates/${editingTemplate.id}`, "PATCH", payload);

    setSaving(false);

    if (!res.ok) {
      setSaveError(res.message || "Failed to update template.");
      return;
    }

    setEditingTemplate(null);
    setSaveSuccess(`Template "${editName}" updated successfully.`);
    await reload(true);
  };

  const renderSimulatedPreview = (t: TemplateListItem) => {
    let bodyText = t.bodyTemplate;
    let subjText = t.subjectTemplate || "";

    for (const [key, val] of Object.entries(SAMPLE_DATA)) {
      bodyText = bodyText.replaceAll(`{{${key}}}`, val);
      subjText = subjText.replaceAll(`{{${key}}}`, val);
    }

    return { subject: subjText, body: bodyText };
  };

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <Alert variant="success">
          <span>{saveSuccess}</span>
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
          {["ALL", "EMAIL", "SMS", "WHATSAPP", "IN_APP"].map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setSelectedChannel(ch)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedChannel === ch ? "bg-brand text-white shadow-sm" : "bg-surface-2 text-fg-2 hover:bg-surface-2/80 hover:text-fg"
              }`}
            >
              {ch}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <label htmlFor="templates-search-filter" className="sr-only">
            Search templates
          </label>
          <input
            id="templates-search-filter"
            type="search"
            aria-label="Search templates"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && <div className="py-12 text-center text-sm text-fg-muted">Loading notification templates catalogue...</div>}

      {/* Template Cards Grid */}
      {!loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((tmpl) => (
            <div
              key={tmpl.id}
              className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-line-strong hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-fg">{tmpl.name}</h3>
                    <p className="font-mono text-xs text-fg-muted uppercase tracking-wider">{tmpl.code}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-semibold text-brand-fg uppercase">
                      {tmpl.channel}
                    </span>
                    {tmpl.isSystem && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-fg-muted">System</span>
                    )}
                  </div>
                </div>

                {tmpl.subjectTemplate && (
                  <p className="mt-3 truncate text-xs text-fg-2">
                    <strong className="text-fg">Subject:</strong> {tmpl.subjectTemplate}
                  </p>
                )}

                <p className="mt-2 line-clamp-3 rounded-xl bg-canvas p-2.5 text-xs text-fg-muted whitespace-pre-wrap font-mono">
                  {tmpl.bodyTemplate}
                </p>

                {tmpl.variables.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {tmpl.variables.map((v) => (
                      <span key={v} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-fg-muted">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-3">
                <Button variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => setPreviewTemplate(tmpl)}>
                  <EyeIcon className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
                <Button variant="primary" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => handleOpenEdit(tmpl)}>
                  <PencilIcon className="h-3.5 w-3.5 mr-1" />
                  Customize
                </Button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-fg-muted">
              No notification templates match your search criteria.
            </div>
          )}
        </div>
      )}

      {/* Edit Template Dialog */}
      <Dialog
        open={Boolean(editingTemplate)}
        onClose={() => setEditingTemplate(null)}
        title={`Customize Template: ${editingTemplate?.name ?? ""}`}
        description="Update message wording. Variable placeholders inside {{token}} will be safely substituted at dispatch time."
      >
        {saveError && (
          <div className="mb-3">
            <Alert variant="error">
              <span>{saveError}</span>
            </Alert>
          </div>
        )}

        <div className="space-y-4 py-2">
          <TextField label="Template Name" value={editName} onChange={(e) => setEditName(e.target.value)} required />

          {editingTemplate?.channel === NotificationChannel.EMAIL && (
            <TextField label="Subject Template" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} required />
          )}

          <div>
            <label htmlFor={editBodyId} className="block text-sm font-medium text-fg">
              Body Template
            </label>
            <textarea
              id={editBodyId}
              rows={6}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-canvas p-3 font-mono text-xs text-fg focus:border-brand-strong focus:outline-none"
              required
            />
          </div>

          {editingTemplate && editingTemplate.variables.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-fg-muted">Available Tokens:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {editingTemplate.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEditBody((prev) => prev + ` {{${v}}}`)}
                    className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-fg hover:border-brand-strong hover:text-brand-fg"
                  >
                    + {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button variant="secondary" onClick={() => setEditingTemplate(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        title={`Preview: ${previewTemplate?.name ?? ""}`}
        description="Sample rendered output with realistic placeholder variables."
      >
        {previewTemplate && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-fg">Channel:</span>
              <span className="rounded-full bg-brand-tint px-2 py-0.5 font-medium text-brand-fg">{previewTemplate.channel}</span>
            </div>

            {previewTemplate.channel === NotificationChannel.EMAIL ? (
              <div className="rounded-xl border border-line bg-canvas p-4 text-xs shadow-inner">
                <div className="border-b border-line pb-2 font-medium text-fg">
                  Subject: {renderSimulatedPreview(previewTemplate).subject}
                </div>
                <div
                  className="mt-3 whitespace-pre-wrap text-fg"
                  dangerouslySetInnerHTML={{ __html: renderSimulatedPreview(previewTemplate).body }}
                />
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-line bg-canvas p-4">
                <div className="rounded-xl bg-brand-tint p-3 text-xs text-fg">
                  <p className="whitespace-pre-wrap">{renderSimulatedPreview(previewTemplate).body}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setPreviewTemplate(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
