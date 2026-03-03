import BrConnectionForm from "./BrConnectionForm";
import OpenThreadConfigForm from "./OpenThreadConfigForm";
import SystemTab from "./SystemTab";
import "./Settings.scss";
import type { BrConnectionConfigFromBackend } from "../../types/websocket";

export type SettingsSection = "br" | "openthread" | "system";

interface SettingsProps {
  brConfig: BrConnectionConfigFromBackend | null;
  onSaveBrConfig: (config: { brHost: string; brPort: number; useMdns?: boolean }) => void;
  onTestBrConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }>;
  activeSection?: SettingsSection;
}

export default function Settings({
  brConfig,
  onSaveBrConfig,
  onTestBrConnect,
  activeSection = "br",
}: SettingsProps) {
  return (
    <div className="settings-page">
      <div className="settings-tab-content">
        {activeSection === "br" && (
          <BrConnectionForm
            initialConfig={brConfig}
            onSave={onSaveBrConfig}
            onTestConnect={onTestBrConnect}
          />
        )}
        {activeSection === "openthread" && <OpenThreadConfigForm />}
        {activeSection === "system" && <SystemTab />}
      </div>
    </div>
  );
}
