import { useState } from "react";
import { useWebSocketContext } from "@shared/hooks/use-websocket-context.hook";
import { useToast } from "@shared/contexts/toast.context";
import "@nodes/components/commission-node-modal/commission-node-modal.style.scss";

const DEFAULT_EUI64 = "f0f5bdfffe104b24";
const DEFAULT_PSK = "H01THREAD";
const TIMEOUT_OPTIONS = [60, 120, 300] as const;
const DEFAULT_TIMEOUT = 60;

export interface CommissionNodeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CommissionNodeModal({ open, onClose }: CommissionNodeModalProps) {
  const { commissionerConnect, threadState } = useWebSocketContext();
  const { showToast } = useToast();
  const isLeader = threadState?.toLowerCase() === "leader";

  const [eui64, setEui64] = useState(DEFAULT_EUI64);
  const [psk, setPsk] = useState(DEFAULT_PSK);
  const [timeoutSeconds, setTimeoutSeconds] = useState(DEFAULT_TIMEOUT);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleClose = () => {
    if (connecting) return;
    setEui64(DEFAULT_EUI64);
    setPsk(DEFAULT_PSK);
    setTimeoutSeconds(DEFAULT_TIMEOUT);
    setMessage(null);
    onClose();
  };

  const handleConnect = async () => {
    setMessage(null);
    if (!eui64.trim() || !psk.trim()) {
      showToast("error", "EUI64 và PSK không được để trống.");
      return;
    }
    setConnecting(true);
    const result = await commissionerConnect(eui64.trim(), psk.trim(), timeoutSeconds);
    setConnecting(false);
    if (result.success) {
      showToast("success", "Đã thêm joiner. Thiết bị có thể kết nối mạng.");
      handleClose();
    } else {
      showToast("error", result.error ?? "Kết nối thất bại.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="commission-node-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="commission-node-modal-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="commission-node-card commission-node-modal-card">
        <div className="commission-node-header">
          <div className="commission-node-header-text">
            <h3 id="commission-node-modal-title" className="commission-node-title">
              Commission Node
            </h3>
            <p className="commission-node-subtitle">
              Enter Joiner credentials to add a new device.
            </p>
          </div>
          <button
            type="button"
            className="commission-node-close"
            onClick={handleClose}
            disabled={connecting}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="commission-node-body">
          {!isLeader && (
            <div className="commission-node-alert commission-node-alert-warn">
              Commissioner chỉ khả dụng khi thiết bị ở state <strong>leader</strong>.
              {threadState ? ` State hiện tại: ${threadState}.` : " Đang lấy state…"}
            </div>
          )}
          {message && (
            <div className={`commission-node-alert commission-node-alert-${message.type}`}>
              {message.text}
            </div>
          )}
          <div className="commission-node-form">
            <div className="commission-node-field">
              <label className="commission-node-label" htmlFor="commission-modal-eui64">
                Joiner EUI64 <span className="commission-node-required">*</span>
              </label>
              <div className="commission-node-input-wrap">
                <span className="material-symbols-outlined commission-node-input-icon" aria-hidden>qr_code_2</span>
                <input
                  id="commission-modal-eui64"
                  type="text"
                  className="commission-node-input"
                  value={eui64}
                  onChange={(e) => setEui64(e.target.value)}
                  placeholder="e.g. d431f4e1f7481234"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={connecting || !isLeader}
                />
              </div>
              <p className="commission-node-helper">The unique identifier for the device.</p>
            </div>
            <div className="commission-node-field">
              <label className="commission-node-label" htmlFor="commission-modal-psk">
                Joiner PIN <span className="commission-node-required">*</span>
              </label>
              <div className="commission-node-input-wrap">
                <span className="material-symbols-outlined commission-node-input-icon" aria-hidden>pin</span>
                <input
                  id="commission-modal-psk"
                  type="text"
                  className="commission-node-input"
                  value={psk}
                  onChange={(e) => setPsk(e.target.value)}
                  placeholder="e.g. J01NME"
                  autoComplete="off"
                  disabled={connecting || !isLeader}
                />
              </div>
              <p className="commission-node-helper">The commissioning credential provided with the device.</p>
            </div>
            <div className="commission-node-field">
              <label className="commission-node-label" htmlFor="commission-modal-timeout">
                Commissioning Timeout
              </label>
              <div className="commission-node-select-wrap">
                <select
                  id="commission-modal-timeout"
                  className="commission-node-select"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value) as (typeof TIMEOUT_OPTIONS)[number])}
                  disabled={connecting || !isLeader}
                  aria-label="Commissioning timeout"
                >
                  {TIMEOUT_OPTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} seconds
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined commission-node-select-icon" aria-hidden>expand_more</span>
              </div>
            </div>
            <div className="commission-node-info">
              <span className="material-symbols-outlined commission-node-info-icon" aria-hidden>info</span>
              <p className="commission-node-info-text">
                Ensure the joining device is powered on and in range of a router.
              </p>
            </div>
          </div>
        </div>
        <div className="commission-node-footer">
          <button
            type="button"
            className="commission-node-btn commission-node-btn-secondary"
            onClick={handleClose}
            disabled={connecting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="commission-node-btn commission-node-btn-primary"
            onClick={handleConnect}
            disabled={connecting || !isLeader}
          >
            {connecting ? (
              <>
                <span className="commission-node-connect-dots" aria-hidden>
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
                Connecting…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined commission-node-btn-icon" aria-hidden>play_arrow</span>
                Start Commissioning
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
