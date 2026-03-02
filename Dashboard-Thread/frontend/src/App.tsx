import { useState, useEffect } from "react";
import type { BrConnectionConfigFromBackend } from "./types/websocket";
import { useWebSocketContext } from "./hooks/useWebSocketContext";
import Settings from "./components/Settings";
import BrConnectionForm from "./components/Settings/BrConnectionForm";
import Status from "./components/Status";
import Nodes from "./components/Nodes/Nodes";
import TopNav, { type NavPage } from "./components/common/TopNav";
import ToastContainer from "./components/common/ToastContainer";
import "./App.scss";

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
          <div className="loading waiting-for-backend">
            <span className="waiting-dot" />
            <p className="waiting-message">Waiting for backend...</p>
            <p className="waiting-hint">Start the backend or reconnecting.</p>
          </div>
        </div>
      </div>
    );
  }

  // Chưa cấu hình BR → TopNav chỉ logo + form cấu hình
  if (!config) {
    return (
      <div className="app-layout">
        <TopNav logoOnly />
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

  return (
    <div className="app-layout">
      <TopNav
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
        {page === "settings" && (
          <div className="app-container">
            <Settings
              brConfig={config ?? null}
              onSaveBrConfig={handleConfigSave}
              onTestBrConnect={testBrConnect}
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
