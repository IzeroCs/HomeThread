import { useState, useEffect } from "react";
import type { SerialConfigFromBackend } from "./types/websocket";
import { useWebSocketContext } from "./hooks/useWebSocketContext";
import Settings from "./components/Settings";
import SerialConfigForm from "./components/Settings/SerialConfigForm";
import Status from "./components/Status";
import Dashboard from "./components/Dashboard";
import Commissioner from "./components/Commissioner";
import Console from "./components/Console";
import TopNav, { type NavPage } from "./components/common/TopNav";
import ToastContainer from "./components/common/ToastContainer";
import "./App.scss";

function App() {
  const [config, setConfig] = useState<SerialConfigFromBackend | null>(null);
  const [page, setPage] = useState<NavPage>("settings");

  const {
    connected: wsConnected,
    serialStatus,
    config: backendConfig,
    saveConfig: wsSaveConfig,
    testSerialConnect,
    threadState,
    threadRunOnConnect,
    routerTable,
    childTable,
  } = useWebSocketContext();

  const dashboardCount = (routerTable?.rows?.length ?? 0) + (childTable?.rows?.length ?? 0);

  // Config chỉ lấy từ backend qua WebSocket
  useEffect(() => {
    setConfig(backendConfig ?? null);
  }, [backendConfig]);

  // Thread state do backend poll (interval 4s) và broadcast ot:threadState; frontend chỉ lắng nghe, không gọi lệnh.

  const handleConfigSave = (newConfig: {
    serialPort: string;
    baudRate: number;
  }) => {
    wsSaveConfig({
      serialPort: newConfig.serialPort,
      baudRate: newConfig.baudRate,
    });
    setPage("dashboard");
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

  // Chưa cấu hình serial → TopNav chỉ logo + form cấu hình
  if (!config) {
    return (
      <div className="app-layout">
        <TopNav logoOnly />
        <main className="app-main">
          <div className="app-container">
            <SerialConfigForm
              initialConfig={null}
              onSave={handleConfigSave}
              onTestConnect={testSerialConnect}
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
        dashboardCount={dashboardCount}
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
              serialConfig={config ?? null}
              onSaveSerialConfig={handleConfigSave}
              onTestConnect={testSerialConnect}
            />
          </div>
        )}
        {page === "dashboard" && (
          <div className="app-container">
            <Dashboard />
          </div>
        )}
        {page === "commissioner" && (
          <div className="app-container">
            <Commissioner />
          </div>
        )}
        {page === "console" && (
          <div className="app-container">
            <Console />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
