import { useState, useEffect } from "react";
import { useWebSocketContext } from "../../hooks/useWebSocketContext";
import "./OpenThreadConfigForm.scss";

export default function OpenThreadConfigForm() {
  const {
    serialStatus,
    otConfig,
    getOtConfig,
    setOtConfig,
    threadRunOnConnect,
    getThreadRunOnConnect,
    setThreadRunOnConnect,
  } = useWebSocketContext();
  const [panid, setPanid] = useState("");
  const [channel, setChannel] = useState<number>(11);
  const [networkName, setNetworkName] = useState("");
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
    }
  }, [otConfig]);

  const handleLoad = async () => {
    setMessage(null);
    setLoading(true);
    getOtConfig();
    setTimeout(() => setLoading(false), 1500);
  };

  const handleApply = async () => {
    setMessage(null);
    setApplying(true);
    const result = await setOtConfig({
      panid: panid.trim() || undefined,
      channel: channel >= 11 && channel <= 26 ? channel : undefined,
      networkName: networkName.trim() || undefined,
    });
    setApplying(false);
    if (result.success) {
      setMessage({ type: "success", text: "Đã áp dụng cấu hình." });
    } else {
      setMessage({ type: "error", text: result.error ?? "Áp dụng thất bại." });
    }
  };

  return (
    <div className="form-page">
      <div className="form-card">
        <h2 className="form-page-title">OpenThread / Thread</h2>
        <p className="form-page-description">
          Cấu hình Panid, Channel, Network Name trên thiết bị. Cần kết nối serial trước.
        </p>

        {!isConnected && (
          <div className="form-page-alert form-page-alert-warn">
            Chưa kết nối serial. Vào Dashboard → Connect Serial rồi quay lại đây.
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
          <div className="form-group ot-config-switch">
            <label className="ot-config-checkbox-label">
              <input
                type="checkbox"
                checked={threadRunOnConnect}
                onChange={(e) => setThreadRunOnConnect(e.target.checked)}
              />
              <span className="ot-config-checkbox-text">
                Khởi động Thread
              </span>
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
