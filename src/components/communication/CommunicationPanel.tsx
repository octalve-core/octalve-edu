"use client";

import { useState } from "react";
import { FileTextIcon, MailIcon, SendIcon } from "@/components/ui/icons";
import { BroadcastComposer } from "./BroadcastComposer";
import { TemplatesManager } from "./TemplatesManager";
import { DispatchLogsView } from "./DispatchLogsView";
import { SendingProgress } from "./SendingProgress";
import { useQueuePump } from "./useQueuePump";

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
  // messages that are due (a broadcast just queued, or one that was cut off) are sent in the background, whichever tab is open
  const pump = useQueuePump(schoolCode);

  const tabs: Array<{ key: TabKey; label: string; icon: typeof SendIcon }> = [
    { key: "broadcast", label: "Broadcast Composer", icon: SendIcon },
    { key: "templates", label: "Notification Templates", icon: FileTextIcon },
    { key: "logs", label: "Delivery Logs & Diagnostics", icon: MailIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="border-b border-line">
        {/* On a phone the three tabs side by side were 15 px wider than the screen, so the whole page scrolled sideways (and Chrome widened its layout viewport to fit). Tighter padding makes them
            fit at 412 px; overflow-x-auto keeps a narrower screen scrolling inside the strip, not the page. */}
        <nav role="tablist" aria-label="Communication navigation" className="-mb-px flex space-x-1 overflow-x-auto sm:space-x-4">
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
                className={`flex items-center gap-2 border-b-2 px-2 py-3 text-sm font-semibold transition-all sm:px-3.5 ${
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

      <SendingProgress state={pump.state} onRetry={() => void pump.resume()} onDismiss={pump.dismiss} />

      {/* Tab Panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="focus:outline-none">
        {activeTab === "broadcast" && (
          <BroadcastComposer
            schoolCode={schoolCode}
            campuses={campuses}
            classArms={classArms}
            onBroadcastSent={() => setActiveTab("logs")}
            onQueued={pump.begin}
          />
        )}

        {activeTab === "templates" && <TemplatesManager schoolCode={schoolCode} />}

        {activeTab === "logs" && <DispatchLogsView schoolCode={schoolCode} />}
      </div>
    </div>
  );
}
