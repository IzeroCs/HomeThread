import { useState, useEffect, FormEvent } from "react";
import { SerialConfig } from "../../utils/SerialConfig";
import "./SerialConfigForm.scss";

const DEFAULT_CONFIG: SerialConfig = {
  serialPort: "/dev/ttyACM0",
  baudRate: 115200,
  commandPrefix: "ot",
};

interface SerialConfigFormProps {
  initialConfig?: SerialConfig | null;
  onSave: (config: SerialConfig) => void;
  onTestConnect?: (config: SerialConfig) => Promise<{ success: boolean; error?: string }>;
}

function validateForm(formData: SerialConfig): Partial<Record<keyof SerialConfig, string>> {
  const newErrors: Partial<Record<keyof SerialConfig, string>> = {};
  if (!formData.serialPort.trim()) {
    newErrors.serialPort = "Serial port is required";
  }
  if (formData.baudRate < 9600 || formData.baudRate > 2000000) {
    newErrors.baudRate = "Baud rate must be between 9600 and 2000000";
  }
  return newErrors;
}

export default function SerialConfigForm({ initialConfig, onSave, onTestConnect }: SerialConfigFormProps) {
  const [formData, setFormData] = useState<SerialConfig>(
    initialConfig ?? DEFAULT_CONFIG
  );

  useEffect(() => {
    if (initialConfig) {
      setFormData(initialConfig);
    } else {
      setFormData(DEFAULT_CONFIG);
    }
  }, [initialConfig]);

  const [errors, setErrors] = useState<Partial<Record<keyof SerialConfig, string>>>({});
  const [testStatus, setTestStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [testSucceeded, setTestSucceeded] = useState(false);

  const handleFieldChange = <K extends keyof SerialConfig>(field: K, value: SerialConfig[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestSucceeded(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newErrors = validateForm(formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setTestStatus({ type: "idle" });
    onSave(formData);
  };

  const handleTestConnect = async () => {
    const newErrors = validateForm(formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    if (!onTestConnect) {
      setTestStatus({ type: "error", message: "Test connect not available" });
      return;
    }
    setTestStatus({ type: "loading" });
    const result = await onTestConnect(formData);
    if (result.success) {
      setTestStatus({ type: "success", message: "Connection successful" });
      setTestSucceeded(true);
    } else {
      setTestStatus({ type: "error", message: result.error ?? "Connection failed" });
      setTestSucceeded(false);
    }
  };

  const canSave = !onTestConnect || testSucceeded;
  const alertMessage =
    testStatus.type === "success"
      ? testStatus.message
      : testStatus.type === "error"
        ? testStatus.message
        : Object.keys(errors).length > 0
          ? errors.serialPort ||
            errors.baudRate ||
            "Please check the fields below."
          : null;
  const alertType =
    testStatus.type === "success"
      ? "success"
      : testStatus.type === "error" || Object.keys(errors).length > 0
        ? "error"
        : null;

  return (
    <div className="form-page">
      <div className="form-card">
        <h2 className="form-page-title">Serial Port Configuration</h2>
        <p className="form-page-description">
          Configure serial port settings connection
        </p>

        {alertMessage && alertType && (
          <div
            className={`form-page-alert form-page-alert-${alertType}`}
            role="alert"
          >
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-page-form">
          <div className="form-group">
            <label htmlFor="serialPort">Serial Port</label>
            <input
              type="text"
              id="serialPort"
              value={formData.serialPort}
              onChange={(e) => handleFieldChange("serialPort", e.target.value)}
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
                handleFieldChange("baudRate", parseInt(e.target.value, 10) || 115200)
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

          <div className="form-actions">
            {onTestConnect && (
              <button
                type="button"
                className="test-connect-button"
                onClick={handleTestConnect}
                disabled={testStatus.type === "loading"}
              >
                {testStatus.type === "loading" ? "Testing…" : "Test Connect"}
              </button>
            )}
            <button
              type="submit"
              className="btn-primary submit-button"
              disabled={onTestConnect ? !canSave : false}
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
