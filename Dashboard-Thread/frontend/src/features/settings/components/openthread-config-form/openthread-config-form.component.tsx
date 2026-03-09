import { useState, useEffect } from "react";
import { useWebSocketContext } from "@shared/hooks/use-websocket-context.hook";
import { useToast } from "@shared/contexts/toast.context";
import "@settings/components/openthread-config-form/openthread-config-form.style.scss";

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
  const [showNetworkKey, setShowNetworkKey] = useState(false);

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
      <div className="form-page-header">
        <h2 className="form-page-title">Cấu hình mạng Thread</h2>
        <p className="form-page-description">
          Quản lý thông số kỹ thuật và trạng thái hoạt động của mạng Mesh trong môi trường OpenThread.
        </p>
      </div>

      {!isConnected && (
        <div className="form-page-alert form-page-alert-warn">
          Chưa kết nối BR. Vào Status/Nodes để kết nối rồi quay lại đây.
        </div>
      )}

      {message && (
        <div className={`form-page-alert form-page-alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="form-card ot-card">
        <div className="ot-card-header">
          <div className="ot-card-title">
            <span className="ot-card-title-icon" aria-hidden="true">
              <span className="material-symbols-outlined">device_hub</span>
            </span>
            <span>Thông số mạng</span>
          </div>
          <div className="ot-toggle-group">
            <span className="ot-toggle-label">Khởi động Thread</span>
            <label className="ot-toggle">
              <input
                type="checkbox"
                checked={threadRunOnConnect}
                onChange={async (e) => {
                  const newValue = e.target.checked;
                  setThreadRunOnConnect(newValue);

                  if (newValue) {
                    const result = await startThread();
                    if (result.success) {
                      showToast("success", "Đã khởi động Thread.");
                    } else {
                      showToast("error", result.error ?? "Không thể khởi động Thread.");
                      setThreadRunOnConnect(false);
                    }
                  } else {
                    const result = await stopThread();
                    if (result.success) {
                      showToast("success", "Đã dừng Thread.");
                    } else {
                      showToast("error", result.error ?? "Không thể dừng Thread.");
                      setThreadRunOnConnect(true);
                    }
                  }
                }}
                disabled={!isConnected}
              />
              <span className="ot-toggle-track" />
              <span className="ot-toggle-thumb" />
            </label>
          </div>
        </div>

        <div className="ot-card-body form-page-form">
          <div className="form-row-2">
            <div className="form-group ot-field-group">
              <label htmlFor="ot-panid">PAN ID</label>
              <div className="ot-input-wrap">
                <input
                  id="ot-panid"
                  type="text"
                  value={panid}
                  onChange={(e) => setPanid(e.target.value)}
                  placeholder="0x1986"
                  disabled={!isConnected}
                />
              </div>
            </div>
            <div className="form-group ot-field-group">
              <label htmlFor="ot-channel">Kênh (Channel)</label>
              <div className="ot-input-wrap">
                <input
                  id="ot-channel"
                  type="number"
                  min={11}
                  max={26}
                  value={channel}
                  onChange={(e) => setChannel(parseInt(e.target.value, 10) || 11)}
                  disabled={!isConnected}
                />
              </div>
            </div>
          </div>

          <div className="form-group ot-field-group">
            <label htmlFor="ot-networkname">Tên mạng (Network Name)</label>
            <div className="ot-input-wrap">
              <input
                id="ot-networkname"
                type="text"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                placeholder="OpenThread-Mesh"
                disabled={!isConnected}
              />
            </div>
          </div>

          <div className="form-group ot-field-group">
            <label htmlFor="ot-extendedpanid">Extended PAN ID</label>
            <div className="ot-input-wrap">
              <input
                id="ot-extendedpanid"
                type="text"
                value={extendedPanId}
                onChange={(e) => setExtendedPanId(e.target.value)}
                placeholder="DEADBEEF00112233"
                disabled={!isConnected}
              />
            </div>
          </div>

          <div className="form-group ot-field-group">
            <label htmlFor="ot-networkkey">Khóa mạng (Network Key)</label>
            <div className="ot-input-wrap">
              <input
                id="ot-networkkey"
                type={showNetworkKey ? "text" : "password"}
                value={networkKey}
                onChange={(e) => setNetworkKey(e.target.value)}
                placeholder="00112233445566778899AABBCCDDEEFF"
                disabled={!isConnected}
              />
              <button
                type="button"
                className="ot-eye-btn"
                onClick={() => setShowNetworkKey((prev) => !prev)}
                title={showNetworkKey ? "Ẩn khóa" : "Hiện khóa"}
              >
                <span className="material-symbols-outlined">
                  {showNetworkKey ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <span className="ot-field-hint">Khóa mạng được mã hóa để đảm bảo an toàn.</span>
          </div>
        </div>

        <div className="ot-card-footer">
          <button
            type="button"
            className="form-btn form-btn--ghost"
            onClick={handleLoad}
            disabled={!isConnected || loading}
          >
            {loading ? "Đang tải…" : "Lấy lại"}
          </button>
          <button
            type="button"
            className="form-btn form-btn--primary"
            onClick={handleApply}
            disabled={!isConnected || applying}
          >
            {applying ? "Đang áp dụng…" : "Áp dụng"}
          </button>
        </div>
      </div>
    </div>
  );
}
