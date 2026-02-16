import { useState } from "react";
import SerialConfigForm from "./SerialConfigForm";
import OpenThreadConfigForm from "./OpenThreadConfigForm";
import "./Settings.scss";

export type SettingsTab = "serial" | "openthread";

interface SettingsProps {
  serialConfig: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  } | null;
  onSaveSerialConfig: (config: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }) => void;
  onTestConnect: (config: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export default function Settings({
  serialConfig,
  onSaveSerialConfig,
  onTestConnect,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("serial");

  return (
    <div className="settings-page">
      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeTab === "serial" ? "active" : ""}`}
          onClick={() => setActiveTab("serial")}
        >
          Serial Port
        </button>
        <button
          type="button"
          className={`settings-tab ${activeTab === "openthread" ? "active" : ""}`}
          onClick={() => setActiveTab("openthread")}
        >
          OpenThread
        </button>
      </div>
      <div className="settings-tab-content">
        {activeTab === "serial" && (
          <SerialConfigForm
            initialConfig={serialConfig}
            onSave={onSaveSerialConfig}
            onTestConnect={onTestConnect}
          />
        )}
        {activeTab === "openthread" && <OpenThreadConfigForm />}
      </div>
    </div>
  );
}
