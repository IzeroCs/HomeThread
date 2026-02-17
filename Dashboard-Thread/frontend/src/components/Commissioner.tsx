import { useState, useEffect, useMemo } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import "./Commissioner.scss";

/** Thiết bị trả expiration theo ms → chia 1000 để ra giây */
function parseExpirationSeconds(cell: string): number | null {
  const raw = parseInt(String(cell).trim(), 10);
  if (Number.isNaN(raw) || raw < 0) return null;
  return Math.floor(raw / 1000);
}

function formatRemainingSeconds(sec: number): string {
  if (sec <= 0) return "0 s";
  return `${sec} s`;
}

const DEFAULT_EUI64 = "f0f5bdfffe104b24";
const DEFAULT_PSK = "H01THREAD";

const TIMEOUT_OPTIONS = [30, 60, 120, 180, 500] as const;
const DEFAULT_TIMEOUT = 60;

type CommissionerTab = "add" | "list";

export default function Commissioner() {
  const {
    commissionerConnect,
    threadState,
    serialStatus,
    joinerTable,
    getJoinerTable,
  } = useWebSocketContext();
  const isLeader = threadState?.toLowerCase() === "leader";
  const isSerialConnected = serialStatus?.isConnected ?? false;
  const [activeTab, setActiveTab] = useState<CommissionerTab>("add");
  // Joiner table do backend interval (6s) broadcast; frontend chỉ hiển thị joinerTable từ context.

  const [eui64, setEui64] = useState(DEFAULT_EUI64);
  const [psk, setPsk] = useState(DEFAULT_PSK);
  const [timeoutSeconds, setTimeoutSeconds] = useState(DEFAULT_TIMEOUT);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const joinerCount = joinerTable?.rows?.length ?? 0;

  const expirationColIndex = useMemo(() => {
    const headers = joinerTable?.headers ?? [];
    const i = headers.findIndex((h) => String(h).toLowerCase() === "expiration");
    return i >= 0 ? i : -1;
  }, [joinerTable?.headers]);

  const [expirationRemaining, setExpirationRemaining] = useState<number[]>([]);

  useEffect(() => {
    const rows = joinerTable?.rows ?? [];
    if (expirationColIndex < 0 || rows.length === 0) {
      setExpirationRemaining([]);
      return;
    }
    setExpirationRemaining(
      rows.map((row) => {
        const val = parseExpirationSeconds(row[expirationColIndex] ?? "");
        return val ?? 0;
      })
    );
  }, [joinerTable?.rows, expirationColIndex]);

  useEffect(() => {
    if (expirationRemaining.length === 0) return;
    const t = setInterval(() => {
      setExpirationRemaining((prev) => prev.map((s) => Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [expirationRemaining.length]);

  const handleConnect = async () => {
    setMessage(null);
    setConnecting(true);
    const result = await commissionerConnect(eui64.trim(), psk, timeoutSeconds);
    setConnecting(false);
    if (result.success) {
      setMessage({ type: "success", text: "Đã thêm joiner. Thiết bị có thể kết nối mạng." });
    } else {
      setMessage({ type: "error", text: result.error ?? "Kết nối thất bại." });
    }
  };

  return (
    <div className="form-page">
      <div className="form-card commissioner-card">
        <h1 className="form-page-title">Commissioner</h1>

        {!isLeader && (
          <div className="form-page-alert form-page-alert-warn">
            Commissioner chỉ khả dụng khi thiết bị ở state <strong>leader</strong>.
            {threadState ? ` State hiện tại: ${threadState}.` : " Đang lấy state…"}
          </div>
        )}

        <div className="commissioner-tabs" role="tablist" aria-label="Commissioner">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "add"}
            aria-controls="commissioner-panel-add"
            id="commissioner-tab-add"
            className={`commissioner-tab ${activeTab === "add" ? "commissioner-tab-active" : ""}`}
            onClick={() => setActiveTab("add")}
          >
            Nhập thiết bị
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "list"}
            aria-controls="commissioner-panel-list"
            id="commissioner-tab-list"
            className={`commissioner-tab ${activeTab === "list" ? "commissioner-tab-active" : ""}`}
            onClick={() => setActiveTab("list")}
          >
            Danh sách ({joinerCount})
          </button>
        </div>

        <div className="commissioner-tab-panels">
          <div
            id="commissioner-panel-add"
            role="tabpanel"
            aria-labelledby="commissioner-tab-add"
            hidden={activeTab !== "add"}
            className="commissioner-tab-panel"
          >
            <p className="form-page-description">
              Nhập PSK và EUI64 thiết bị joiner để commissioner cho phép thiết bị kết nối mạng.
            </p>
            {message && (
              <div className={`form-page-alert form-page-alert-${message.type}`}>
                {message.text}
              </div>
            )}
            <div className="form-page-form">
              <div className="form-group">
                <label htmlFor="commissioner-eui64">
                  EUI64 (mã định danh)
                </label>
                <input
                  id="commissioner-eui64"
                  type="text"
                  value={eui64}
                  onChange={(e) => setEui64(e.target.value)}
                  placeholder="vd: 0000b57fffe15d68"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={connecting || !isLeader}
                />
              </div>
              <div className="form-group">
                <label htmlFor="commissioner-psk">
                  PSK (passphrase)
                </label>
                <input
                  id="commissioner-psk"
                  type="text"
                  value={psk}
                  onChange={(e) => setPsk(e.target.value)}
                  placeholder="Nhập PSK"
                  autoComplete="off"
                  disabled={connecting || !isLeader}
                />
              </div>
              <div className="form-group commissioner-timeout-group">
                <span className="commissioner-timeout-label">Thời gian hết hạn</span>
                <div
                  className="commissioner-segmented"
                  role="radiogroup"
                  aria-label="Thời gian hết hạn joiner"
                >
                  {TIMEOUT_OPTIONS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      role="radio"
                      aria-checked={timeoutSeconds === sec}
                      className={`commissioner-segmented-option ${timeoutSeconds === sec ? "commissioner-segmented-option-active" : ""}`}
                      onClick={() => setTimeoutSeconds(sec)}
                      disabled={connecting || !isLeader}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConnect}
                  disabled={connecting || !isLeader}
                >
                  {connecting ? (
                    <>
                      Đang kết nối
                      <span className="commissioner-connect-dots" aria-hidden="true">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                      </span>
                    </>
                  ) : (
                    "Kết nối"
                  )}
                </button>
              </div>
            </div>
          </div>

          <div
            id="commissioner-panel-list"
            role="tabpanel"
            aria-labelledby="commissioner-tab-list"
            hidden={activeTab !== "list"}
            className="commissioner-tab-panel"
          >
            <div className="commissioner-joiner-header">
              <span className="commissioner-joiner-title">Joiner đang chờ</span>
              <button
                type="button"
                className="commissioner-joiner-refresh"
                onClick={() => getJoinerTable()}
                disabled={!isSerialConnected}
              >
                Làm mới
              </button>
            </div>
            <div className="commissioner-joiner-table-wrap">
              {!isSerialConnected ? (
                <p className="commissioner-joiner-muted">Kết nối serial để xem danh sách joiner.</p>
              ) : joinerTable?.error ? (
                <p className="commissioner-joiner-error">{joinerTable.error}</p>
              ) : joinerTable == null || (!(joinerTable.headers?.length) && !(joinerTable.rows?.length)) ? (
                <p className="commissioner-joiner-muted">Không có dữ liệu.</p>
              ) : (joinerTable.rows?.length ?? 0) === 0 ? (
                <p className="commissioner-joiner-muted">Không có thiết bị.</p>
              ) : (
                <table className="commissioner-joiner-table">
                  <thead>
                    <tr>
                      {(joinerTable.headers ?? []).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(joinerTable.rows ?? []).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>
                            {ci === expirationColIndex
                              ? formatRemainingSeconds(expirationRemaining[ri] ?? 0)
                              : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
