import { useState } from "react";
import { useWebSocketContext } from "../../hooks/useWebSocketContext";
import { useToast } from "../../contexts/ToastContext";
import ConfirmModal from "../common/ConfirmModal";
import "./SystemTab.scss";

type ConfirmAction = "reset" | "factory" | null;

export default function SystemTab() {
  const { serialStatus, reset, factoryReset } = useWebSocketContext();
  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [loading, setLoading] = useState(false);

  const isConnected = serialStatus?.isConnected ?? false;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setLoading(true);
    try {
      const result = action === "reset" ? await reset() : await factoryReset();
      if (result.success) {
        showToast("success", action === "reset" ? "Đã gửi lệnh reset thiết bị." : "Đã gửi lệnh factory reset.");
      } else {
        showToast("error", result.error ?? "Thất bại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-page">
      <div className="form-card">
        <h2 className="form-page-title">Hệ thống</h2>
        <p className="form-page-description">Quản lý thiết bị: khởi động lại hoặc xoá toàn bộ cấu hình.</p>

        {!isConnected && (
          <div className="form-page-alert form-page-alert-warn">
            Chưa kết nối serial. Vào Dashboard → Connect Serial rồi quay lại đây.
          </div>
        )}

        <div className="system-action-list">
          <div className="system-action-item">
            <div className="system-action-info">
              <span className="system-action-title">Khởi động lại</span>
              <span className="system-action-desc">Reset thiết bị, giữ nguyên toàn bộ cấu hình Thread.</span>
            </div>
            <button
              type="button"
              className="system-action-btn warning"
              disabled={!isConnected}
              onClick={() => setConfirmAction("reset")}
            >
              Reset
            </button>
          </div>

          <div className="system-action-item">
            <div className="system-action-info">
              <span className="system-action-title">Factory Reset</span>
              <span className="system-action-desc">Xoá toàn bộ cấu hình Thread và khởi động lại thiết bị.</span>
            </div>
            <button
              type="button"
              className="system-action-btn danger"
              disabled={!isConnected}
              onClick={() => setConfirmAction("factory")}
            >
              Factory Reset
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmAction === "reset"}
        onClose={() => !loading && setConfirmAction(null)}
        title="Khởi động lại thiết bị"
        message="Thiết bị sẽ khởi động lại. Cấu hình Thread được giữ nguyên. Tiếp tục?"
        confirmLabel="Reset"
        variant="warning"
        loading={loading}
        onConfirm={handleConfirm}
      />

      <ConfirmModal
        open={confirmAction === "factory"}
        onClose={() => !loading && setConfirmAction(null)}
        title="Factory Reset"
        message="Toàn bộ cấu hình Thread sẽ bị xoá và thiết bị khởi động lại. Hành động này không thể hoàn tác. Tiếp tục?"
        confirmLabel="Factory Reset"
        variant="danger"
        loading={loading}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
