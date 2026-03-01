import { useState } from "react";
import BrConnectionForm from "./BrConnectionForm";
import OpenThreadConfigForm from "./OpenThreadConfigForm";
import SystemTab from "./SystemTab";
import "./Settings.scss";
import type { BrConnectionConfigFromBackend } from "../../types/websocket";

export type SettingsTab = "br" | "openthread" | "system";

interface SettingsProps {
  brConfig: BrConnectionConfigFromBackend | null;
  onSaveBrConfig: (config: { brHost: string; brPort: number; useMdns?: boolean }) => void;
  onTestBrConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }>;
}

export default function Settings({
  brConfig,
  onSaveBrConfig,
  onTestBrConnect,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("br");

  return (
    <div className="settings-page">
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === "br" ? "active" : ""}`}
          onClick={() => setActiveTab("br")}
        >
          BR Connection
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === "openthread" ? "active" : ""}`}
          onClick={() => setActiveTab("openthread")}
        >
          OpenThread
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === "system" ? "active" : ""}`}
          onClick={() => setActiveTab("system")}
        >
          System
        </button>
      </div>
      <div className="settings-tab-content">
        {activeTab === "br" && (
          <BrConnectionForm
            initialConfig={brConfig}
            onSave={onSaveBrConfig}
            onTestConnect={onTestBrConnect}
          />
        )}
        {activeTab === "openthread" && <OpenThreadConfigForm />}
        {activeTab === "system" && <SystemTab />}
      </div>
    </div>
  );
}
