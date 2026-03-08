import BrConnectionForm from "./BrConnectionForm";
import OpenThreadConfigForm from "./OpenThreadConfigForm";
import SystemTab from "./SystemTab";
import "./Settings.scss";

export type SettingsSection = "br" | "openthread" | "system";

interface SettingsProps {
  isConnected: boolean;
  onTestBrConnect?: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }>;
  activeSection?: SettingsSection;
}

export default function Settings({
  isConnected,
  onTestBrConnect,
  activeSection = "br",
}: SettingsProps) {
  const handleTestConnect = onTestBrConnect
    ? () => onTestBrConnect({ brHost: "", brPort: 5000 })
    : undefined;

  return (
    <div className="settings-page">
      <div className="settings-tab-content">
        {activeSection === "br" && (
          <BrConnectionForm isConnected={isConnected} onTestConnect={handleTestConnect} />
        )}
        {activeSection === "openthread" && <OpenThreadConfigForm />}
        {activeSection === "system" && <SystemTab />}
      </div>
    </div>
  );
}
