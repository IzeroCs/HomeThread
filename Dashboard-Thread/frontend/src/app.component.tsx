import { useState, useEffect } from "react";
import type { BrConnectionConfigFromBackend } from "@shared/types/websocket.type";
import { useWebSocketContext } from "@shared/hooks/use-websocket-context.hook";
import Settings, { type SettingsSection } from "@settings";
import BrConnectionForm from "@settings/components/br-connection-form/br-connection-form.component";
import Status from "@status/status.component";
import Nodes from "@nodes/nodes.component";
import Sidebar, { type NavPage } from "@shared/components/sidebar/sidebar.component";
import ToastContainer from "@shared/components/toast-container/toast-container.component";
import WaitingForBackend from "@shared/components/waiting-for-backend/waiting-for-backend.component";
import "@/app.style.scss";

function App() {
  const [config, setConfig] = useState<BrConnectionConfigFromBackend | null>(null);
  const [page, setPage] = useState<NavPage>("status");

  const {
    connected: wsConnected,
    serialStatus,
    config: backendConfig,
    saveConfig: wsSaveConfig,
    testBrConnect,
    threadState,
    threadRunOnConnect,
    routerTable,
    childTable,
  } = useWebSocketContext();

  const nodesCount = (routerTable?.rows?.length ?? 0) + (childTable?.rows?.length ?? 0);

  // Config chỉ lấy từ backend qua WebSocket
  useEffect(() => {
    setConfig(backendConfig ?? null);
  }, [backendConfig]);

  // Thread state do backend poll (interval 4s) và broadcast ot:threadState; frontend chỉ lắng nghe, không gọi lệnh.

  const handleConfigSave = (newConfig: {
    brHost: string;
    brPort: number;
    useMdns?: boolean;
  }) => {
    wsSaveConfig({
      brHost: newConfig.brHost,
      brPort: newConfig.brPort,
      useMdns: newConfig.useMdns,
    });
    setPage("nodes");
  };

  if (!wsConnected) {
    return (
      <div className="app-layout app-layout--waiting">
        <div className="app-container">
          <WaitingForBackend />
        </div>
      </div>
    );
  }

  // Chưa cấu hình BR → Sidebar chỉ logo, main = form cấu hình
  if (!config) {
    return (
      <div className="app-layout">
        <Sidebar logoOnly />
        <main className="app-main">
          <div className="app-container">
            <BrConnectionForm
              initialConfig={null}
              onSave={handleConfigSave}
              onTestConnect={testBrConnect}
            />
          </div>
        </main>
      </div>
    );
  }

  const isSettingsPage =
    page === "settings" ||
    page === "settings-br" ||
    page === "settings-openthread" ||
    page === "settings-system";

  const settingsSection: SettingsSection =
    page === "settings-openthread" ? "openthread" : page === "settings-system" ? "system" : "br";

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        serialConnected={serialStatus?.isConnected ?? false}
        threadState={threadState}
        threadRunOnConnect={threadRunOnConnect}
        nodesCount={nodesCount}
      />
      <ToastContainer />
      <main className="app-main">
        {page === "status" && (
          <div className="app-container">
            <Status />
          </div>
        )}
        {isSettingsPage && (
          <div className="app-container">
            <Settings
              brConfig={config ?? null}
              onSaveBrConfig={handleConfigSave}
              onTestBrConnect={testBrConnect}
              activeSection={settingsSection}
            />
          </div>
        )}
        {page === "nodes" && (
          <div className="app-container">
            <Nodes />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
