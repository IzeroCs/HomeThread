import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import "./BrConnectionForm.scss";

interface BrConnectionFormProps {
  isConnected: boolean;
  onTestConnect?: () => Promise<{ success: boolean; error?: string }>;
}

export default function BrConnectionForm({ isConnected, onTestConnect }: BrConnectionFormProps) {
  const { showToast } = useToast();
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string>("");

  const handleTestConnect = async () => {
    if (!onTestConnect) return;
    setTestStatus("loading");
    const result = await onTestConnect();
    if (result.success) {
      setTestStatus("success");
      setTestMessage("OTBR available on D-Bus");
      showToast("success", "Kết nối OTBR thành công!");
    } else {
      setTestStatus("error");
      setTestMessage(result.error ?? "OTBR not available");
      showToast("error", result.error ?? "Kết nối thất bại.");
    }
  };

  return (
    <div className="form-page">
      <div className="form-page-header">
        <h2 className="form-page-title">BR Connection</h2>
        <p className="form-page-description">
          Border Router: OTBR (D-Bus). Backend giao tiếp với otbr-agent qua D-Bus (volume socket chung).
        </p>
      </div>

      <div className="form-card br-connection-card otbr-status-card">
        <div className="otbr-status-row">
          <span className="otbr-status-label">Trạng thái</span>
          <span className={`otbr-status-value ${isConnected ? "connected" : "disconnected"}`}>
            <span className="status-dot" aria-hidden="true" />
            {isConnected ? "Connected to OTBR" : "OTBR unavailable"}
          </span>
        </div>
        {testStatus !== "idle" && (
          <div className={`otbr-test-message ${testStatus === "error" ? "error" : "success"}`}>
            {testStatus === "loading" ? "Testing…" : testMessage}
          </div>
        )}
        {onTestConnect && (
          <div className="br-connection-actions">
            <button
              type="button"
              className="form-btn form-btn--ghost br-test-connect"
              onClick={handleTestConnect}
              disabled={testStatus === "loading"}
            >
              Test connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
