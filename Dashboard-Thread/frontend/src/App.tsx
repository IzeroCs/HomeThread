import { useState, useEffect } from "react";
import type { SerialConfigFromBackend } from "./types/websocket";
import { useWebSocketContext } from "./hooks/useWebSocketContext";
import Settings from "./components/Settings";
import SerialConfigForm from "./components/Settings/SerialConfigForm";
import Status from "./components/Status";
import Dashboard from "./components/Dashboard";
import TopNav, { type NavPage } from "./components/TopNav";
import "./App.scss";

function App() {
  const [config, setConfig] = useState<SerialConfigFromBackend | null>(null);
  const [page, setPage] = useState<NavPage>("dashboard");

  const {
    connected: wsConnected,
    serialStatus,
    config: backendConfig,
    saveConfig: wsSaveConfig,
    testSerialConnect,
    getThreadState,
    threadState,
    threadRunOnConnect,
  } = useWebSocketContext();

  // Config chỉ lấy từ backend qua WebSocket
  useEffect(() => {
    setConfig(backendConfig ?? null);
  }, [backendConfig]);

  // Khi đã cấu hình tự chạy Thread và serial connect: poll state (leader/router/child/detached) để cập nhật symbol TopNav
  useEffect(() => {
    if (!serialStatus?.isConnected || !threadRunOnConnect) return;
    getThreadState();
    const interval = setInterval(getThreadState, 4000);
    return () => clearInterval(interval);
  }, [serialStatus?.isConnected, threadRunOnConnect, getThreadState]);

  const handleConfigSave = (newConfig: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }) => {
    wsSaveConfig({
      serialPort: newConfig.serialPort,
      baudRate: newConfig.baudRate,
      commandPrefix: newConfig.commandPrefix,
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
      />
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
      </main>
    </div>
  );
}

export default App;
