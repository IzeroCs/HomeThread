import { useState, useEffect } from "react";
import { useWebSocketContext } from "../../hooks/useWebSocketContext";
import { useToast } from "../../contexts/ToastContext";
import "./OpenThreadConfigForm.scss";

export default function OpenThreadConfigForm() {
  const {
    serialStatus,
    otConfig,
    getOtConfig,
    setOtConfig,
    startThread,
    stopThread,
    threadRunOnConnect,
    getThreadRunOnConnect,
    setThreadRunOnConnect,
  } = useWebSocketContext();
  const { showToast } = useToast();
  const [panid, setPanid] = useState("");
  const [channel, setChannel] = useState<number>(11);
  const [networkName, setNetworkName] = useState("");
  const [extendedPanId, setExtendedPanId] = useState("");
  const [networkKey, setNetworkKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isConnected = serialStatus?.isConnected ?? false;

  // Tự lấy cấu hình từ thiết bị khi đã kết nối serial; load preference "tự chạy Thread" từ DB
  useEffect(() => {
    if (isConnected) {
      getOtConfig();
    }
    getThreadRunOnConnect();
  }, [isConnected, getOtConfig, getThreadRunOnConnect]);

  useEffect(() => {
    if (otConfig?.error) {
      setMessage({ type: "error", text: otConfig.error });
    } else if (otConfig) {
      if (otConfig.panid != null) setPanid(otConfig.panid);
      if (otConfig.channel != null) setChannel(otConfig.channel);
      if (otConfig.networkName != null) setNetworkName(otConfig.networkName);
      if (otConfig.extendedPanId != null) setExtendedPanId(otConfig.extendedPanId);
      if (otConfig.networkKey != null) setNetworkKey(otConfig.networkKey);
    }
  }, [otConfig]);

  const handleLoad = async () => {
    setMessage(null);
    setLoading(true);
    try {
      await getOtConfig();
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setMessage(null);
    setApplying(true);
    const result = await setOtConfig({
      panid: panid.trim() || undefined,
      channel: channel >= 11 && channel <= 26 ? channel : undefined,
      networkName: networkName.trim() || undefined,
      extendedPanId: extendedPanId.trim() || undefined,
      networkKey: networkKey.trim() || undefined,
    });
    setApplying(false);
    if (result.success) {
      showToast("success", "Đã áp dụng cấu hình thành công.");
    } else {
      showToast("error", result.error ?? "Áp dụng thất bại.");
    }
  };

  return (
    <div className="form-page">
      <div className="form-card">
        <h2 className="form-page-title">OpenThread / Thread</h2>
        <p className="form-page-description">
          Cấu hình Panid, Channel, Network Name, Extended PAN ID, Network Key trên thiết bị
        </p>

        {!isConnected && (
          <div className="form-page-alert form-page-alert-warn">
            Chưa kết nối serial. Vào Nodes → Connect Serial rồi quay lại đây.
          </div>
        )}

        {message && (
          <div className={`form-page-alert form-page-alert-${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="form-page-form">
          <div className="form-group">
            <label htmlFor="ot-panid">PAN ID</label>
            <input
              id="ot-panid"
              type="text"
              value={panid}
              onChange={(e) => setPanid(e.target.value)}
              placeholder="0x1234"
              disabled={!isConnected}
            />
            <small className="form-hint">Ví dụ: 0x5938</small>
          </div>
          <div className="form-group">
            <label htmlFor="ot-channel">Channel</label>
            <input
              id="ot-channel"
              type="number"
              min={11}
              max={26}
              value={channel}
              onChange={(e) => setChannel(parseInt(e.target.value, 10) || 11)}
              disabled={!isConnected}
            />
            <small className="form-hint">11–26 (IEEE 802.15.4)</small>
          </div>
          <div className="form-group">
            <label htmlFor="ot-networkname">Network Name</label>
            <input
              id="ot-networkname"
              type="text"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              placeholder="OpenThread-5938"
              disabled={!isConnected}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ot-extendedpanid">Extended PAN ID</label>
            <input
              id="ot-extendedpanid"
              type="text"
              value={extendedPanId}
              onChange={(e) => setExtendedPanId(e.target.value)}
              placeholder="0x1234567890abcdef"
              disabled={!isConnected}
            />
            <small className="form-hint">16 ký tự hex (8 bytes), ví dụ: 0x1234567890abcdef</small>
          </div>
          <div className="form-group">
            <label htmlFor="ot-networkkey">Network Key</label>
            <input
              id="ot-networkkey"
              type="text"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
              placeholder="0x1234567890abcdef1234567890abcdef"
              disabled={!isConnected}
            />
            <small className="form-hint">32 ký tự hex (16 bytes), ví dụ: 0x1234567890abcdef1234567890abcdef</small>
          </div>
          <div className="form-group ot-config-switch">
            <label className="ot-config-toggle-label">
              <div className="ot-config-toggle-wrapper">
                <input
                  type="checkbox"
                  className="ot-config-toggle-input"
                  checked={threadRunOnConnect}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setThreadRunOnConnect(newValue);
                    
                    // Gọi startThread hoặc stopThread khi toggle
                    if (newValue) {
                      const result = await startThread();
                      if (result.success) {
                        showToast("success", "Đã khởi động Thread.");
                      } else {
                        showToast("error", result.error ?? "Không thể khởi động Thread.");
                        // Revert toggle nếu thất bại
                        setThreadRunOnConnect(false);
                      }
                    } else {
                      const result = await stopThread();
                      if (result.success) {
                        showToast("success", "Đã dừng Thread.");
                      } else {
                        showToast("error", result.error ?? "Không thể dừng Thread.");
                        // Revert toggle nếu thất bại
                        setThreadRunOnConnect(true);
                      }
                    }
                  }}
                />
                <span className="ot-config-toggle-slider">
                  <span className="ot-config-toggle-text-inner">
                    {threadRunOnConnect ? "ON" : "OFF"}
                  </span>
                </span>
              </div>
              <span className="ot-config-toggle-text">Khởi động Thread</span>
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="ot-config-btn load"
              onClick={handleLoad}
              disabled={!isConnected || loading}
            >
              {loading ? "Đang tải…" : "Lấy lại"}
            </button>
            <button
              type="button"
              className="ot-config-btn apply"
              onClick={handleApply}
              disabled={!isConnected || applying}
            >
              {applying ? (
                <>
                  Đang áp dụng
                  <span className="apply-dots" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </>
              ) : (
                "Áp dụng"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
