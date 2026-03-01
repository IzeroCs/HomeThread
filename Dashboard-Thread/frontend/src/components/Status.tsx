import { useState } from "react";
import { useWebSocketContext } from "../hooks/useWebSocketContext";
import "./Status.scss";

function formatPanId(panid: string | null | undefined): string {
  if (!panid) return "—";
  return panid.startsWith("0x") || panid.startsWith("0X") ? panid : `0x${panid}`;
}

interface StatusProps {
  /** Gọi khi user bấm "Configure Border Router" (trạng thái disconnected) */
  onConfigureBr?: () => void;
}

export default function Status({ onConfigureBr }: StatusProps) {
  const { serialStatus, otConfig, config: brConfig, testBrConnect } = useWebSocketContext();
  const [networkKeyVisible, setNetworkKeyVisible] = useState(false);
  const isConnected = serialStatus?.isConnected ?? false;
  const ipaddr = otConfig?.ipaddr?.trim() || null;

  return (
    <div className="status-page">
      <h1 className="status-page-title">System Status</h1>
      <p className="status-page-subtitle">
        OpenThread Border Router v{__APP_VERSION__} - Network health and configuration overview
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
          <div className="status-card status-card-br status-card-br--disconnected">
            <div className="status-card-br-disconnected-left">
              <div className="status-card-br-icon-small">
                <span className="material-symbols-outlined">link_off</span>
              </div>
              <div className="status-card-br-disconnected-text">
                <p className="status-card-br-disconnected-label">BR Connection Status</p>
                <div className="status-card-br-disconnected-row">
                  <h3 className="status-card-br-disconnected-status">DISCONNECTED</h3>
                  <span className="status-badge-dot status-badge-dot--red" />
                </div>
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
        )}
      </section>

      <section className="status-section status-section-ot">
        <div className="status-section-ot-header">
          <h2 className="status-section-ot-title">
            <span className="material-symbols-outlined">lan</span>
            OpenThread Network
          </h2>
          {!isConnected && (
            <span className="status-section-ot-snapshot">Snapshot: Last seen — ago</span>
          )}
        </div>
        <div className="status-card status-card-ot">
          {otConfig?.error ? (
            <p className="status-error">{otConfig.error}</p>
          ) : !isConnected ? (
            <>
              <div className="status-ot-ghost" aria-hidden>
                <div className="status-ot-ghost-item" />
                <div className="status-ot-ghost-item" />
                <div className="status-ot-ghost-item" />
                <div className="status-ot-ghost-item" />
                <div className="status-ot-ghost-item status-ot-ghost-item--wide" />
                <div className="status-ot-ghost-item status-ot-ghost-item--grid" />
              </div>
              <div className="status-ot-overlay">
                <div className="status-ot-overlay-card">
                  <div className="status-ot-overlay-icon">
                    <span className="material-symbols-outlined">signal_disconnected</span>
                  </div>
                  <h4 className="status-ot-overlay-title">No Network Data Available</h4>
                  <p className="status-ot-overlay-text">
                    Connect to the Border Router to view real-time network topology, traffic metrics, and node status.
                  </p>
                  <button
                    type="button"
                    className="status-ot-overlay-btn"
                    onClick={() => onConfigureBr?.()}
                  >
                    <span className="material-symbols-outlined">link</span>
                    Configure Border Router
                  </button>
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
    </div>
  );
}
