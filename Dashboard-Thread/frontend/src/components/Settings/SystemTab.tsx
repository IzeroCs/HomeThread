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
    <div className="form-page system-page">
      <div className="system-page-header">
        <h2 className="system-page-title">Hệ thống</h2>
        <p className="system-page-description">
          Quản lý trạng thái vận hành và thiết lập gốc của thiết bị Border Router.
        </p>
        {!isConnected && (
          <p className="system-page-hint">Chưa kết nối BR. Vào tab BR Connection để thiết lập kết nối.</p>
        )}
      </div>

      <div className="system-action-card system-card-restart">
        <div className="system-card-image">
          <div className="bg-img" />
          <div className="icon">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </div>
          <div className="dot-indicator">
            <div className="dot active" />
            <div className="dot" />
            <div className="dot" />
          </div>
        </div>

        <div className="system-card-content">
          <div className="system-card-info">
            <h3>Khởi động lại</h3>
            <p>Thực hiện khởi động lại phần mềm của thiết bị. Kết nối của tất cả các node sẽ bị gián đoạn tạm thời.</p>
          </div>
          <div className="system-card-action">
            <button
              type="button"
              className="system-btn system-btn-orange"
              disabled={!isConnected || loading}
              onClick={() => setConfirmAction("reset")}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="system-danger-divider">
        <span>Vùng nguy hiểm</span>
      </div>

      <div className="system-action-card system-card-factory">
        <div className="system-card-image">
          <div className="bg-img" />
          <div className="icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM5 13h14c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm7 5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
            </svg>
          </div>
        </div>

        <div className="system-card-content">
          <div className="system-card-info">
            <h3>Factory Reset</h3>
            <p>
              Xóa toàn bộ cấu hình, dữ liệu mạng, thông tin định danh và đưa thiết bị về trạng thái xuất xưởng.{" "}
              <span className="warning-inline">Hành động này không thể hoàn tác.</span>
            </p>
          </div>
          <div className="system-card-action">
            <button
              type="button"
              className="system-btn system-btn-red"
              disabled={!isConnected || loading}
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
