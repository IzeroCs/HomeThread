import { useEffect, useState } from "react";
import Modal from "@shared/components/modal/modal.component";
import "@shared/components/confirm-modal/confirm-modal.style.scss";

const COUNTDOWN_SECONDS = 5;

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  /** Nhãn nút xác nhận (mặc định: "Xác nhận") */
  confirmLabel?: string;
  /** Màu nút xác nhận */
  variant?: "danger" | "warning";
  /** Đang xử lý */
  loading?: boolean;
  onConfirm: () => void;
}

export default function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Xác nhận",
  variant = "danger",
  loading = false,
  onConfirm,
}: ConfirmModalProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  // Reset và chạy đếm ngược mỗi lần modal mở
  useEffect(() => {
    if (!open) {
      setCountdown(COUNTDOWN_SECONDS);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const canConfirm = countdown === 0 && !loading;

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title}>
      <div className="confirm-modal-content">
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-modal-btn cancel"
            onClick={onClose}
            disabled={loading}
          >
            Huỷ
          </button>
          <button
            type="button"
            className={`confirm-modal-btn confirm ${variant}`}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {loading
              ? "Đang xử lý…"
              : countdown > 0
              ? `${confirmLabel} (${countdown}s)`
              : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
