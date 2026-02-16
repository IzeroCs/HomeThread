import { useState, useEffect } from "react";
import { SerialConfig, getSerialConfig, hasSerialConfig } from "./utils/SerialConfig";
import SerialConfigForm from "./components/SerialConfigForm";
import "./App.scss";

function App() {
  const [config, setConfig] = useState<SerialConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if config exists
    const savedConfig = getSerialConfig();
    setConfig(savedConfig);
    setIsLoading(false);
  }, []);

  const handleConfigSave = (newConfig: SerialConfig) => {
    setConfig(newConfig);
  };

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // Show config form if no config exists
  if (!hasSerialConfig() || !config) {
    return (
      <div className="app-container">
        <SerialConfigForm onSave={handleConfigSave} />
      </div>
    );
  }

  // Main dashboard (to be implemented)
  return (
    <div className="app-container">
      <div className="dashboard">
        <h1>Dashboard Thread</h1>
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
            onClick={() => {
              setConfig(null);
            }}
          >
            Change Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
