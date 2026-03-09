import BrConnectionForm from "@settings/components/br-connection-form/br-connection-form.component";
import OpenThreadConfigForm from "@settings/components/openthread-config-form/openthread-config-form.component";
import SystemTab from "@settings/components/system-tab/system-tab.component";
import "@settings/settings.style.scss";
import type { BrConnectionConfigFromBackend } from "@shared/types/websocket.type";

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
