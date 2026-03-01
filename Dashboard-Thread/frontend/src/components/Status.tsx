import { useWebSocketContext } from "../hooks/useWebSocketContext";
import type { OtConfig } from "shared/src/types";
import "./Status.scss";

/** Tạo danh sách các field dataset đã parse để hiển thị (loại trừ các field đã hiển thị ở trên: PAN ID, Channel, Network Name) */
function getDatasetFields(otConfig: OtConfig | null | undefined): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];

  if (otConfig?.activeTimestamp != null) {
    fields.push({ label: "Active Timestamp", value: otConfig.activeTimestamp });
  }
  // Channel đã hiển thị ở trên, bỏ qua
  if (otConfig?.wakeUpChannel != null) {
    fields.push({ label: "Wake Up Channel", value: String(otConfig.wakeUpChannel) });
  }
  if (otConfig?.channelMask != null) {
    fields.push({ label: "Channel Mask", value: otConfig.channelMask });
  }
  if (otConfig?.extendedPanId != null) {
    fields.push({ label: "Extended PAN ID", value: otConfig.extendedPanId });
  }
  if (otConfig?.meshLocalPrefix != null) {
    fields.push({ label: "Mesh Local Prefix", value: otConfig.meshLocalPrefix });
  }
  if (otConfig?.networkKey != null) {
    fields.push({ label: "Network Key", value: otConfig.networkKey });
  }
  // Network Name đã hiển thị ở trên, bỏ qua
  // PAN ID đã hiển thị ở trên, bỏ qua
  if (otConfig?.pskc != null) {
    fields.push({ label: "PSKc", value: otConfig.pskc });
  }
  if (otConfig?.securityPolicy != null) {
    fields.push({ label: "Security Policy", value: otConfig.securityPolicy });
  }

  return fields;
}

export default function Status() {
  const { serialStatus, otConfig } = useWebSocketContext();
  const isConnected = serialStatus?.isConnected ?? false;
  // OT config do backend interval (6s) broadcast; frontend chỉ hiển thị otConfig từ context.

  // Backend trả về ipaddr là một string IPv6 đơn (Leader RLOC) - 16 bytes được parse thành IPv6 string
  const ipaddr = otConfig?.ipaddr?.trim() || null;

  const datasetFields = getDatasetFields(otConfig);

  return (
    <div className="status-page">
      <h1>Status</h1>
      <section className="status-section">
        <h2>BR Connection</h2>
        <div className="status-card">
          <div className="status-row">
            <span className="status-label">Trạng thái:</span>
            <span className={`status-badge ${serialStatus?.isConnected ? "connected" : "disconnected"}`}>
              {serialStatus?.isConnected ? "Đã kết nối" : "Chưa kết nối"}
            </span>
          </div>
          {serialStatus?.isConnected && serialStatus?.host != null && (
            <div className="status-row">
              <span className="status-label">BR:</span>
              <span className="status-value">{serialStatus.host}:{serialStatus.port ?? "—"}</span>
            </div>
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
                <span className="status-value">
                  {otConfig?.panid
                    ? otConfig.panid.startsWith("0x") || otConfig.panid.startsWith("0X")
                      ? otConfig.panid
                      : `0x${otConfig.panid}`
                    : "—"}
                </span>
              </div>
              <div className="status-row">
                <span className="status-label">Channel:</span>
                <span className="status-value">{otConfig?.channel ?? "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">Network Name:</span>
                <span className="status-value">{otConfig?.networkName ?? "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">Thread version:</span>
                <span className="status-value">{otConfig?.threadVersion ?? "—"}</span>
              </div>
              <div className="status-row">
                <span className="status-label">IP Address:</span>
                <span className="status-value">{ipaddr ?? "—"}</span>
              </div>
              {datasetFields.length > 0 && (
                <>
                  {datasetFields.map((field, i) => (
                    <div key={i} className="status-row">
                      <span className="status-label">{field.label}:</span>
                      <span className="status-value">{field.value}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
