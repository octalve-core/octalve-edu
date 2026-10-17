"use client";

import { useState } from "react";
import { FileTextIcon, MailIcon, SendIcon } from "@/components/ui/icons";
import { BroadcastComposer } from "./BroadcastComposer";
import { TemplatesManager } from "./TemplatesManager";
import { DispatchLogsView } from "./DispatchLogsView";

interface CampusOption {
  id: string;
  name: string;
}

interface ClassArmOption {
  id: string;
  name: string;
  classGroup: { name: string };
}

interface CommunicationPanelProps {
  schoolCode: string;
  campuses: CampusOption[];
  classArms: ClassArmOption[];
}

type TabKey = "broadcast" | "templates" | "logs";

export function CommunicationPanel({ schoolCode, campuses, classArms }: CommunicationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("broadcast");

  const tabs: Array<{ key: TabKey; label: string; icon: typeof SendIcon }> = [
    { key: "broadcast", label: "Broadcast Composer", icon: SendIcon },
    { key: "templates", label: "Notification Templates", icon: FileTextIcon },
    { key: "logs", label: "Delivery Logs & Diagnostics", icon: MailIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="border-b border-line">
        <nav role="tablist" aria-label="Communication navigation" className="-mb-px flex space-x-2 sm:space-x-4">
          {tabs.map(({ key, label, icon: Icon }) => {
            const isCurrent = activeTab === key;
            return (
              <button
                key={key}
                role="tab"
                id={`tab-${key}`}
                aria-controls={`panel-${key}`}
                aria-selected={isCurrent}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition-all ${
                  isCurrent ? "border-brand-strong text-brand-fg" : "border-transparent text-fg-muted hover:border-line hover:text-fg"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="focus:outline-none">
        {activeTab === "broadcast" && (
          <BroadcastComposer
            schoolCode={schoolCode}
            campuses={campuses}
            classArms={classArms}
            onBroadcastSent={() => setActiveTab("logs")}
          />
        )}

        {activeTab === "templates" && <TemplatesManager schoolCode={schoolCode} />}

        {activeTab === "logs" && <DispatchLogsView schoolCode={schoolCode} />}
      </div>
    </div>
  );
}
