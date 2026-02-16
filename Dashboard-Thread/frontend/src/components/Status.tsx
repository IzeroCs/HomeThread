import { useEffect } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import "./Status.scss";

/** Gán nhãn cho từng dòng ipaddr theo chuẩn OpenThread (fe80 = Link-Local, RLOC, fd = Mesh-Local EID) */
function ipaddrLineLabel(line: string): string {
  const s = line.trim().toLowerCase();
  if (s.startsWith("fe80")) return "Link-Local";
  if (s.includes("0:ff:fe00:") || s.includes("00ff:fe00:")) return "RLOC";
  if (s.startsWith("fd")) return "Mesh-Local EID";
  return "IPv6";
}

/** Tách dòng dataset active "Key: value" thành [tag, value] để hiển thị dạng bảng như ipaddr */
function parseDatasetLine(line: string): { tag: string; value: string } {
  const idx = line.indexOf(":");
  if (idx >= 0) {
    return {
      tag: line.slice(0, idx).trim(),
      value: line.slice(idx + 1).trim(),
    };
  }
  return { tag: "—", value: line.trim() };
}

const RUNNING_STATES = ["leader", "router", "child"];

export default function Status() {
  const { serialStatus, otConfig, getOtConfig, threadState } = useWebSocketContext();
  const isConnected = serialStatus?.isConnected ?? false;
  const isThreadRunning =
    threadState != null && RUNNING_STATES.includes(threadState.toLowerCase());

  useEffect(() => {
    if (isConnected) getOtConfig();
  }, [isConnected, getOtConfig]);

  // Khi state chuyển sang leader/router/child → gửi lại lệnh lấy thông tin (dataset active, ipaddr lúc disabled/detached báo Not Found)
  useEffect(() => {
    if (isConnected && isThreadRunning) getOtConfig();
  }, [isConnected, isThreadRunning, getOtConfig]);

  const ipaddrLines =
    otConfig?.ipaddr != null && otConfig.ipaddr !== ""
      ? otConfig.ipaddr.split("\n").filter((l) => l.trim())
      : [];

  const datasetLines =
    otConfig?.datasetActive != null && otConfig.datasetActive !== ""
      ? otConfig.datasetActive.split("\n").filter((l) => l.trim())
      : [];

  return (
    <div className="status-page">
      <h1>Status</h1>
      <section className="status-section">
        <h2>Serial</h2>
        <div className="status-card">
          <div className="status-row">
            <span className="status-label">Trạng thái:</span>
            <span className={`status-badge ${serialStatus?.isConnected ? "connected" : "disconnected"}`}>
              {serialStatus?.isConnected ? "Đã kết nối" : "Chưa kết nối"}
            </span>
          </div>
          {serialStatus?.isConnected && (
            <>
              <div className="status-row">
                <span className="status-label">Port:</span>
                <span className="status-value">{serialStatus.path || "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">Baud rate:</span>
                <span className="status-value">{serialStatus.baudRate ?? "—"}</span>
              </div>
            </>
          )}
        </div>
      </section>
      <section className="status-section">
        <h2>OpenThread</h2>
        <div className="status-card">
          {otConfig?.error ? (
            <p className="status-error">{otConfig.error}</p>
          ) : !isConnected ? (
            <p className="status-muted">Kết nối serial để xem thông tin.</p>
          ) : (
            <>
              <div className="status-row">
                <span className="status-label">PAN ID:</span>
                <span className="status-value">{otConfig?.panid ?? "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">Channel:</span>
                <span className="status-value">{otConfig?.channel ?? "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">Network Name:</span>
                <span className="status-value">{otConfig?.networkName ?? "—"}</span>
              </div>
              {ipaddrLines.length > 0 ? (
                <div className="status-ipaddr-block">
                  <span className="status-label">IP Address:</span>
                  <div className="status-ipaddr-lines">
                    {ipaddrLines.map((line, i) => (
                      <div key={i} className="status-ipaddr-row">
                        <span className="status-ipaddr-tag">{ipaddrLineLabel(line)}</span>
                        <span className="status-ipaddr-value">{line.trim()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="status-row">
                  <span className="status-label">IP Address:</span>
                  <span className="status-value">—</span>
                </div>
              )}
            </>
          )}
        </div>
        {isConnected && !otConfig?.error && (
          <div className="status-card status-card-dataset">
            <div className="status-ipaddr-block">
              <span className="status-label">Dataset Active</span>
              {datasetLines.length > 0 ? (
                <div className="status-ipaddr-lines">
                  {datasetLines.map((line, i) => {
                    const { tag, value } = parseDatasetLine(line);
                    return (
                      <div key={i} className="status-ipaddr-row">
                        <span className="status-ipaddr-tag">{tag}</span>
                        <span className="status-ipaddr-value">{value}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="status-ipaddr-lines status-ipaddr-lines-empty">
                  <span className="status-value">—</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
