import { useState, useEffect } from "react";
import type { SerialConfigFromBackend } from "./types/websocket";
import { useWebSocketContext } from "./hooks/useWebSocketContext";
import SerialConfigForm from "./components/SerialConfigForm";
import TopNav, { type NavPage } from "./components/TopNav";
import "./components/Dashboard.scss";
import "./App.scss";

function App() {
  const [config, setConfig] = useState<SerialConfigFromBackend | null>(null);
  const [page, setPage] = useState<NavPage>("dashboard");

  const {
    connected: wsConnected,
    serialStatus,
    config: backendConfig,
    configError,
    serialError,
    saveConfig: wsSaveConfig,
    testSerialConnect,
    connectSerial,
    disconnectSerial,
  } = useWebSocketContext();

  // Config chỉ lấy từ backend qua WebSocket
  useEffect(() => {
    setConfig(backendConfig ?? null);
  }, [backendConfig]);

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
      <div className="app-container">
        <div className="loading">Connecting to backend...</div>
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
      <TopNav currentPage={page} onNavigate={setPage} />
      <main className="app-main">
        {page === "settings" && (
          <div className="app-container">
            <SerialConfigForm
              initialConfig={config ?? null}
              onSave={handleConfigSave}
              onTestConnect={testSerialConnect}
            />
          </div>
        )}
        {page === "dashboard" && (
          <div className="app-container">
            <div className="dashboard">
                <h1>Dashboard Thread</h1>

                <div className="connection-status">
                  <div className="status-row">
                    <span className="status-label">WebSocket:</span>
                    <span
                      className={`status-badge ${wsConnected ? "connected" : "disconnected"}`}
                    >
                      {wsConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Serial Port:</span>
                    <span
                      className={`status-badge ${
                        serialStatus?.isConnected ? "connected" : "disconnected"
                      }`}
                    >
                      {serialStatus?.isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  {(configError || serialError) && (
                    <div className="status-error">
                      {configError || serialError}
                    </div>
                  )}
                  <div className="serial-actions">
                    <button
                      type="button"
                      className="change-config-button"
                      disabled={!wsConnected}
                      onClick={connectSerial}
                    >
                      Connect Serial
                    </button>
                    <button
                      type="button"
                      className="change-config-button disconnect"
                      disabled={!wsConnected || !serialStatus?.isConnected}
                      onClick={disconnectSerial}
                    >
                      Disconnect Serial
                    </button>
                  </div>
                </div>

                <div className="config-info">
                  <h2>Current Configuration</h2>
                  <div className="config-display">
                    <div className="config-item">
                      <span className="config-label">Serial Port:</span>
                      <span className="config-value">{config.serialPort}</span>
                    </div>
                    <div className="config-item">
                      <span className="config-label">Baud Rate:</span>
                      <span className="config-value">{config.baudRate}</span>
                    </div>
                    <div className="config-item">
                      <span className="config-label">Command Prefix:</span>
                      <span className="config-value">{config.commandPrefix}</span>
                    </div>
                  </div>
                  <button
                    className="change-config-button"
                    onClick={() => setPage("settings")}
                  >
                    Change Configuration
                  </button>
                </div>
              </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
