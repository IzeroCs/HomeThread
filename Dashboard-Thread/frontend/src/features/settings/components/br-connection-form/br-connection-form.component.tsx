import { useState, useEffect, FormEvent } from "react";
import { DEFAULT_BR_CONFIG, type BrConnectionConfigForm } from "@settings/utils/br-connection-config.util";
import { useToast } from "@shared/contexts/toast.context";
import { BR_CONNECTION } from "shared/src/constants";
import { validateBrConnectionConfig } from "shared/src/validation";
import "@settings/components/br-connection-form/br-connection-form.style.scss";

interface BrConnectionConfigFromBackend extends BrConnectionConfigForm {
  id?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface BrConnectionFormProps {
  initialConfig?: BrConnectionConfigFromBackend | null;
  onSave: (config: BrConnectionConfigForm) => void;
  onTestConnect?: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }>;
}

function getFormErrors(formData: BrConnectionConfigForm): Partial<Record<keyof BrConnectionConfigForm, string>> {
  const err = validateBrConnectionConfig(formData);
  if (!err) return {};
  return { brHost: err, brPort: err };
}

export default function BrConnectionForm({ initialConfig, onSave, onTestConnect }: BrConnectionFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<BrConnectionConfigForm>(
    initialConfig ? { brHost: initialConfig.brHost, brPort: initialConfig.brPort, useMdns: initialConfig.useMdns } : DEFAULT_BR_CONFIG
  );

  useEffect(() => {
    if (initialConfig) {
      setFormData({ brHost: initialConfig.brHost, brPort: initialConfig.brPort, useMdns: initialConfig.useMdns });
    } else {
      setFormData(DEFAULT_BR_CONFIG);
    }
  }, [initialConfig]);

  const [errors, setErrors] = useState<Partial<Record<keyof BrConnectionConfigForm, string>>>({});
  const [testStatus, setTestStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const [testSucceeded, setTestSucceeded] = useState(false);

  const handleFieldChange = <K extends keyof BrConnectionConfigForm>(field: K, value: BrConnectionConfigForm[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestSucceeded(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const newErrors = getFormErrors(formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstError = Object.values(newErrors)[0];
      if (firstError) showToast("error", firstError);
      return;
    }
    setErrors({});
    setTestStatus({ type: "idle" });
    onSave(formData);
    showToast("success", "Đã lưu cấu hình BR.");
  };

  const handleTestConnect = async () => {
    const newErrors = getFormErrors(formData);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstError = Object.values(newErrors)[0];
      if (firstError) showToast("error", firstError);
      return;
    }
    setErrors({});
    if (!onTestConnect) {
      showToast("error", "Test connect not available");
      return;
    }
    setTestStatus({ type: "loading" });
    const result = await onTestConnect({ brHost: formData.brHost, brPort: formData.brPort });
    if (result.success) {
      setTestStatus({ type: "success", message: "Connection successful" });
      setTestSucceeded(true);
      showToast("success", "Kết nối BR thành công!");
    } else {
      setTestStatus({ type: "error", message: result.error ?? "Connection failed" });
      setTestSucceeded(false);
      showToast("error", result.error ?? "Kết nối thất bại.");
    }
  };

  const canSave = !onTestConnect || testSucceeded;
  const alertMessage =
    testStatus.type === "error"
      ? testStatus.message
      : Object.keys(errors).length > 0
        ? errors.brHost || errors.brPort || "Please check the fields below."
        : null;
  const alertType = testStatus.type === "error" || Object.keys(errors).length > 0 ? "error" : null;

  return (
    <div className="form-page">
      <div className="form-page-header">
        <h2 className="form-page-title">BR Connection (TCP)</h2>
        <p className="form-page-description">
          Configure your Border Router TCP connection settings and network parameters.
        </p>
      </div>

      {alertMessage && alertType === "error" && (
        <div className="form-page-alert form-page-alert-error" role="alert">
          {alertMessage}
        </div>
      )}

      <div className="form-card br-connection-card">
        <form onSubmit={handleSubmit} className="form-page-form">
          <div className="form-row-2 br-fields-row">
            <div className="form-group">
              <label htmlFor="brHost">BR Host</label>
              <input
                type="text"
                id="brHost"
                value={formData.brHost}
                onChange={(e) => handleFieldChange("brHost", e.target.value)}
                placeholder="Thread-Host.local"
                className={errors.brHost ? "error" : ""}
              />
              {errors.brHost && (
                <span className="error-message">{errors.brHost}</span>
              )}
              <small className="form-hint">
                DNS name or static IPv6 address of the Border Router.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="brPort">Port</label>
              <input
                type="number"
                id="brPort"
                value={formData.brPort}
                onChange={(e) =>
                  handleFieldChange("brPort", parseInt(e.target.value, 10) || BR_CONNECTION.DEFAULT_PORT)
                }
                min={BR_CONNECTION.MIN_PORT}
                max={BR_CONNECTION.MAX_PORT}
                className={errors.brPort ? "error" : ""}
              />
              {errors.brPort && (
                <span className="error-message">{errors.brPort}</span>
              )}
              <small className="form-hint">
                Standard TCP port for OpenThread management (default: {BR_CONNECTION.DEFAULT_PORT}).
              </small>
            </div>
          </div>

          <div className="br-divider" />

          <div className="br-connection-note">
            <div className="br-connection-note-icon" aria-hidden="true">
              <span className="material-symbols-outlined">info</span>
            </div>
            <p className="br-connection-note-text">
              Changing these settings will restart the monitoring service. Ensure the Border Router is accessible from
              this network before saving.
            </p>
          </div>

          <div className="br-connection-actions">
            {onTestConnect && (
              <button
                type="button"
                className="form-btn form-btn--ghost br-test-connect"
                onClick={handleTestConnect}
                disabled={testStatus.type === "loading"}
              >
                <span className="test-status-dot" aria-hidden="true" />
                {testStatus.type === "loading" ? "Testing…" : "Test Connection"}
              </button>
            )}
            <button
              type="submit"
              className="form-btn form-btn--primary br-submit"
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
