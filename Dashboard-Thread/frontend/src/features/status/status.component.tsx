import { useState } from "react";
import { useWebSocketContext } from "@shared/hooks/use-websocket-context.hook";
import "@status/status.style.scss";

function formatPanId(panid: string | null | undefined): string {
  if (!panid) return "—";
  return panid.startsWith("0x") || panid.startsWith("0X") ? panid : `0x${panid}`;
}

export default function Status() {
  const { serialStatus, otConfig, config: brConfig, testBrConnect, systemInfo } = useWebSocketContext();
  const [networkKeyVisible, setNetworkKeyVisible] = useState(false);
  const isConnected = serialStatus?.isConnected ?? false;
  const ipaddr = otConfig?.ipaddr?.trim() || null;

  return (
    <div className="status-page">
      <h1 className="status-page-title">System Status</h1>
      <p className="status-page-subtitle">
        Network health and configuration overview
      </p>

      <section className="status-section status-section-br">
        {isConnected ? (
          <div className="status-card status-card-br">
            <div className="status-card-br-icon">
              <span className="material-symbols-outlined">router</span>
            </div>
            <div className="status-card-br-content">
              <div className="status-card-br-heading">
                <h2 className="status-card-br-title">BR Connection Status</h2>
                <span className="status-badge connected">
                  <span className="status-badge-dot" />
                  Connected (Đã kết nối)
                </span>
              </div>
              <div className="status-card-br-fields">
                <div className="status-field">
                  <span className="status-field-label">Host Address</span>
                  <span className="status-field-value status-field-value--accent mono-text">
                    {serialStatus?.host != null
                      ? `${serialStatus.host}:${serialStatus.port ?? "—"}`
                      : "—"}
                  </span>
                </div>
                <div className="status-field">
                  <span className="status-field-label">Uptime</span>
                  <span className="status-field-value">—</span>
                </div>
              </div>
              <button
                type="button"
                className="status-btn-refresh"
                onClick={() => brConfig && testBrConnect({ brHost: brConfig.brHost, brPort: brConfig.brPort })}
              >
                <span className="material-symbols-outlined">refresh</span>
                Refresh Connection
              </button>
            </div>
          </div>
        ) : (
          <div className="status-card status-card-br">
            <div className="status-card-br-icon status-card-br-icon--disconnected">
              <span className="material-symbols-outlined">signal_disconnected</span>
            </div>
            <div className="status-card-br-content">
              <div className="status-card-br-heading">
                <h2 className="status-card-br-title">BR Connection Status</h2>
                <span className="status-badge status-badge--disconnected">
                  <span className="status-badge-dot status-badge-dot--red" />
                  Disconnected
                </span>
              </div>
              <div className="status-card-br-fields">
                <div className="status-field">
                  <span className="status-field-label">Host Address</span>
                  <span className="status-field-value mono-text status-field-value--muted">---</span>
                </div>
                <div className="status-field">
                  <span className="status-field-label">Uptime</span>
                  <span className="status-field-value status-field-value--muted">N/A</span>
                </div>
              </div>
              <button
                type="button"
                className="status-btn-refresh"
                onClick={() => brConfig && testBrConnect({ brHost: brConfig.brHost, brPort: brConfig.brPort })}
              >
                <span className="material-symbols-outlined">sync</span>
                Try Reconnecting
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="status-section status-section-ot">
        <div className={`status-section-ot-header ${!isConnected ? "status-section-ot-header--faded" : ""}`}>
          <h2 className="status-section-ot-title">
            <span className="material-symbols-outlined">lan</span>
            OpenThread Network
          </h2>
        </div>
        <div className="status-card status-card-ot">
          {otConfig?.error ? (
            <p className="status-error">{otConfig.error}</p>
          ) : !isConnected ? (
            <>
              <div className="status-ot-grid status-ot-grid--placeholder" aria-hidden>
                <div className="status-field"><span className="status-field-label">Network Name</span><span className="status-field-value status-field-value--muted">Not Available</span></div>
                <div className="status-field"><span className="status-field-label">IP Address</span><span className="status-field-value mono-text status-field-value--muted">Not Available</span></div>
                <div className="status-field status-field-with-action"><span className="status-field-label">Network Key</span><span className="status-field-value mono-text status-field-value--muted">--------------------------------</span><button type="button" className="status-field-toggle" disabled aria-hidden><span className="material-symbols-outlined">visibility_off</span></button></div>
                <div className="status-field"><span className="status-field-label">PAN ID</span><span className="status-field-value mono-text status-field-value--muted">----</span></div>
                <div className="status-field"><span className="status-field-label">Mesh Local Prefix</span><span className="status-field-value mono-text status-field-value--muted">----:----:----:----::/--</span></div>
                <div className="status-field"><span className="status-field-label">PSKc</span><span className="status-field-value mono-text status-field-value--muted">--------------------------------</span></div>
                <div className="status-field"><span className="status-field-label">Channel</span><span className="status-field-value mono-text status-field-value--muted">--</span></div>
                <div className="status-field"><span className="status-field-label">Channel Mask</span><span className="status-field-value mono-text status-field-value--muted">--------------</span></div>
                <div className="status-field"><span className="status-field-label">Security Policy</span><span className="status-field-value mono-text status-field-value--muted">---</span></div>
                <div className="status-field"><span className="status-field-label">Extended PAN ID</span><span className="status-field-value mono-text status-field-value--muted">----------------</span></div>
                <div className="status-field"><span className="status-field-label">Active Timestamp</span><span className="status-field-value status-field-value--muted">-----</span></div>
                <div className="status-field status-field-version"><span className="status-field-label">Thread Version</span><span className="status-field-value status-field-value--muted status-field-value--mono-small">Unknown</span></div>
              </div>
              <div className="status-ot-overlay">
                <div className="status-ot-overlay-card status-ot-overlay-card--compact">
                  <div className="status-ot-overlay-icon status-ot-overlay-icon--muted">
                    <span className="material-symbols-outlined">cloud_off</span>
                  </div>
                  <span className="status-ot-overlay-text-only">Network data unavailable</span>
                </div>
              </div>
            </>
          ) : (
            <div className="status-ot-grid">
              {/* Row 1 */}
              <div className="status-field">
                <span className="status-field-label">Network Name</span>
                <span className="status-field-value status-field-value--accent">{otConfig?.networkName ?? "—"}</span>
              </div>
              <div className="status-field">
                <span className="status-field-label">IP Address</span>
                <span className="status-field-value status-field-value--accent mono-text">{ipaddr ?? "—"}</span>
              </div>
              <div className="status-field status-field-with-action">
                <span className="status-field-label">Network Key</span>
                <span className="status-field-value mono-text">
                  {networkKeyVisible ? (otConfig?.networkKey ?? "—") : "••••••••••••••••"}
                </span>
                <button
                  type="button"
                  className="status-field-toggle"
                  onClick={() => setNetworkKeyVisible((v) => !v)}
                  aria-label={networkKeyVisible ? "Hide" : "Show"}
                >
                  <span className="material-symbols-outlined">{networkKeyVisible ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              {/* Row 2 */}
              <div className="status-field">
                <span className="status-field-label">PAN ID</span>
                <span className="status-field-value mono-text">{formatPanId(otConfig?.panid)}</span>
              </div>
              <div className="status-field">
                <span className="status-field-label">Mesh Local Prefix</span>
                <span className="status-field-value mono-text">{otConfig?.meshLocalPrefix ?? "—"}</span>
              </div>
              <div className="status-field">
                <span className="status-field-label">PSKc</span>
                <span className="status-field-value mono-text">{otConfig?.pskc ?? "—"}</span>
              </div>
              {/* Row 3 */}
              <div className="status-field">
                <span className="status-field-label">Channel</span>
                <div className="status-channel-row">
                  <span className="status-field-value mono-text">{otConfig?.channel ?? "—"}</span>
                  <span className="status-channel-badge">2.4 GHz</span>
                </div>
              </div>
              <div className="status-field">
                <span className="status-field-label">Channel Mask</span>
                <span className="status-field-value mono-text">{otConfig?.channelMask ?? "—"}</span>
              </div>
              <div className="status-field">
                <span className="status-field-label">Security Policy</span>
                <span className="status-field-value mono-text">{otConfig?.securityPolicy ?? "—"}</span>
              </div>
              {/* Row 4 */}
              <div className="status-field">
                <span className="status-field-label">Extended PAN ID</span>
                <span className="status-field-value mono-text">{otConfig?.extendedPanId ?? "—"}</span>
              </div>
              <div className="status-field">
                <span className="status-field-label">Active Timestamp</span>
                <span className="status-field-value">{otConfig?.activeTimestamp ?? "—"}</span>
              </div>
              <div className="status-field status-field-version">
                <span className="status-field-label">Thread Version</span>
                <span className="status-field-value status-field-value--mono-small">{otConfig?.threadVersion ?? "—"}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="status-section status-section-system">
        <div className="status-section-ot-header">
          <h2 className="status-section-ot-title">
            <span className="material-symbols-outlined">computer</span>
            System
          </h2>
        </div>
        <div className="status-card status-card-ot">
          <div className="status-ot-grid status-ot-grid--system">
            <div className="status-field">
              <span className="status-field-label">IPv4 (backend)</span>
              <span className="status-field-value status-field-value--accent mono-text">
                {systemInfo?.ipv4?.length ? systemInfo.ipv4.join(", ") : "—"}
              </span>
            </div>
            <div className="status-field">
              <span className="status-field-label">IPv6 (backend)</span>
              <span className="status-field-value status-field-value--accent mono-text status-field-value--wrap">
                {systemInfo?.ipv6?.length ? systemInfo.ipv6.join(", ") : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
