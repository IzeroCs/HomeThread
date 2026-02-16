import { useState, FormEvent } from "react";
import { SerialConfig, saveSerialConfig } from "../utils/SerialConfig";

interface SerialConfigFormProps {
  onSave: (config: SerialConfig) => void;
}

export default function SerialConfigForm({ onSave }: SerialConfigFormProps) {
  const [formData, setFormData] = useState<SerialConfig>({
    serialPort: "/dev/ttyACM0",
    baudRate: 115200,
    commandPrefix: "ot",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof SerialConfig, string>>>({});

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // Validation
    const newErrors: Partial<Record<keyof SerialConfig, string>> = {};

    if (!formData.serialPort.trim()) {
      newErrors.serialPort = "Serial port is required";
    }

    if (formData.baudRate < 9600 || formData.baudRate > 2000000) {
      newErrors.baudRate = "Baud rate must be between 9600 and 2000000";
    }

    if (!formData.commandPrefix.trim()) {
      newErrors.commandPrefix = "Command prefix is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    saveSerialConfig(formData);
    onSave(formData);
  };

  return (
    <div className="config-container">
      <div className="config-card">
        <h2>Serial Port Configuration</h2>
        <p className="config-description">
          Configure serial port settings for ESP32-H2 ot-br connection
        </p>

        <form onSubmit={handleSubmit} className="config-form">
          <div className="form-group">
            <label htmlFor="serialPort">Serial Port</label>
            <input
              type="text"
              id="serialPort"
              value={formData.serialPort}
              onChange={(e) =>
                setFormData({ ...formData, serialPort: e.target.value })
              }
              placeholder="/dev/ttyACM0"
              className={errors.serialPort ? "error" : ""}
            />
            {errors.serialPort && (
              <span className="error-message">{errors.serialPort}</span>
            )}
            <small className="form-hint">
              Linux: /dev/ttyACM0, /dev/ttyUSB0 | macOS: /dev/cu.usbserial-* |
              Windows: COM3
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="baudRate">Baud Rate</label>
            <input
              type="number"
              id="baudRate"
              value={formData.baudRate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  baudRate: parseInt(e.target.value, 10) || 115200,
                })
              }
              min="9600"
              max="2000000"
              step="9600"
              className={errors.baudRate ? "error" : ""}
            />
            {errors.baudRate && (
              <span className="error-message">{errors.baudRate}</span>
            )}
            <small className="form-hint">
              Common values: 9600, 115200, 460800
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="commandPrefix">Command Prefix</label>
            <input
              type="text"
              id="commandPrefix"
              value={formData.commandPrefix}
              onChange={(e) =>
                setFormData({ ...formData, commandPrefix: e.target.value })
              }
              placeholder="ot"
              className={errors.commandPrefix ? "error" : ""}
            />
            {errors.commandPrefix && (
              <span className="error-message">{errors.commandPrefix}</span>
            )}
            <small className="form-hint">
              Prefix added before CLI commands (e.g., "ot" for "ot state")
            </small>
          </div>

          <button type="submit" className="submit-button">
            Save Configuration
          </button>
        </form>
      </div>
    </div>
  );
}
