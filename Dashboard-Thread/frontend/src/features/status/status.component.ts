import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { OtConfig } from "@shared/types/websocket.type";

import "@shared/components/page-header/page-header.component";
import "@status/status.style.scss";

function formatPanId(panid: string | null | undefined): string {
  if (!panid) return "—";
  return panid.startsWith("0x") || panid.startsWith("0X") ? panid : `0x${panid}`;
}

@customElement("status-view")
export class StatusComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Object }) brStatus: { isConnected: boolean; host?: string; port?: number } | null = null;
  @property({ type: Object }) otConfig: OtConfig | null = null;
  @property({ type: Object }) brConfig: { brHost: string; brPort: number } | null = null;
  @property({ type: Object }) systemInfo: { ipv4: string[]; ipv6: string[] } | null = null;
  @property({ attribute: false }) testBrConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });

  @state() private networkKeyVisible = false;

  private get _isConnected(): boolean {
    return this.brStatus?.isConnected ?? false;
  }

  private get _ipaddr(): string | null {
    return this.otConfig?.ipaddr?.trim() || null;
  }

  render() {
    const isConnected = this._isConnected;
    const ipaddr = this._ipaddr;

    return html`
      <page-header
        heading="Status"
        subtitle="Network health and configuration overview"
        .action=${html`
          <button type="button" class="btn-icon">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        `}>
      </page-header>

      <div class="page-container">
        <div class="status-page">
          <section class="status-section status-section-br">
            <div class="status-card status-card-br">
              <div class="status-card-br-icon ${!isConnected ? "disconnected" : ""}">
                <span class="material-symbols-outlined">${isConnected ? "router" : "signal_disconnected"}</span>
              </div>
              <div class="status-card-br-content">
                <div class="status-card-br-heading">
                  <h2 class="status-card-br-title">BR Connection Status</h2>
                  <span class="status-badge ${isConnected ? "connected" : ""}">
                    <span class="status-badge-dot ${isConnected ? "connected" : ""}"></span>
                    ${isConnected ? "Connected (Đã kết nối)" : "Disconnected (Đã ngắt kết nối)"}
                  </span>
                </div>
                <div class="status-card-br-fields">
                  <div class="status-field">
                    <span class="status-field-label">Host Address</span>
                    <span class="status-field-value status-field-value ${!isConnected ? "muted" : ""}">
                      ${this.brStatus?.host != null ? `${this.brStatus.host}:${this.brStatus.port ?? "—"}` : "—"}
                    </span>
                  </div>
                  <div class="status-field">
                    <span class="status-field-label">Uptime</span>
                    <span class="status-field-value ${!isConnected ? "muted" : ""}">—</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="status-section status-section-ot">
            <div class="status-section-ot-header ${!isConnected ? "status-section-ot-header--faded" : ""}">
              <h2 class="status-section-ot-title">
                <span class="material-symbols-outlined">lan</span>
                OpenThread Network
              </h2>
            </div>
            <div class="status-card status-card-ot">
              ${this.otConfig?.error
                ? html`<p class="status-error">${this.otConfig.error}</p>`
                : !isConnected
                  ? html`
                      <div class="status-ot-grid status-ot-grid--placeholder" aria-hidden>
                        <div class="status-field"><span class="status-field-label">Network Name</span><span class="status-field-value status-field-value--muted">Not Available</span></div>
                        <div class="status-field"><span class="status-field-label">IP Address</span><span class="status-field-value mono-text status-field-value--muted">Not Available</span></div>
                        <div class="status-field status-field-with-action"><span class="status-field-label">Network Key</span><span class="status-field-value mono-text status-field-value--muted">--------------------------------</span><button type="button" class="status-field-toggle" disabled aria-hidden><span class="material-symbols-outlined">visibility_off</span></button></div>
                        <div class="status-field"><span class="status-field-label">PAN ID</span><span class="status-field-value mono-text status-field-value--muted">----</span></div>
                        <div class="status-field"><span class="status-field-label">Mesh Local Prefix</span><span class="status-field-value mono-text status-field-value--muted">----:----:----:----::/--</span></div>
                        <div class="status-field"><span class="status-field-label">PSKc</span><span class="status-field-value mono-text status-field-value--muted">--------------------------------</span></div>
                        <div class="status-field"><span class="status-field-label">Channel</span><span class="status-field-value mono-text status-field-value--muted">--</span></div>
                        <div class="status-field"><span class="status-field-label">Channel Mask</span><span class="status-field-value mono-text status-field-value--muted">--------------</span></div>
                        <div class="status-field"><span class="status-field-label">Security Policy</span><span class="status-field-value mono-text status-field-value--muted">---</span></div>
                        <div class="status-field"><span class="status-field-label">Extended PAN ID</span><span class="status-field-value mono-text status-field-value--muted">----------------</span></div>
                        <div class="status-field"><span class="status-field-label">Active Timestamp</span><span class="status-field-value status-field-value--muted">-----</span></div>
                        <div class="status-field status-field-version"><span class="status-field-label">Thread Version</span><span class="status-field-value status-field-value--muted status-field-value--mono-small">Unknown</span></div>
                      </div>
                      <div class="status-ot-overlay">
                        <div class="status-ot-overlay-card status-ot-overlay-card--compact">
                          <div class="status-ot-overlay-icon status-ot-overlay-icon--muted">
                            <span class="material-symbols-outlined">cloud_off</span>
                          </div>
                          <span class="status-ot-overlay-text-only">Network data unavailable</span>
                        </div>
                      </div>
                    `
                  : html`
                      <div class="status-ot-grid">
                        <div class="status-field">
                          <span class="status-field-label">Network Name</span>
                          <span class="status-field-value status-field-value--accent">${this.otConfig?.networkName ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">IP Address</span>
                          <span class="status-field-value status-field-value--accent mono-text">${ipaddr ?? "—"}</span>
                        </div>
                        <div class="status-field status-field-with-action">
                          <span class="status-field-label">Network Key</span>
                          <span class="status-field-value mono-text">
                            ${this.networkKeyVisible ? (this.otConfig?.networkKey ?? "—") : "••••••••••••••••"}
                          </span>
                          <button
                            type="button"
                            class="status-field-toggle"
                            @click=${() => (this.networkKeyVisible = !this.networkKeyVisible)}
                            aria-label=${this.networkKeyVisible ? "Hide" : "Show"}
                          >
                            <span class="material-symbols-outlined">${this.networkKeyVisible ? "visibility_off" : "visibility"}</span>
                          </button>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">PAN ID</span>
                          <span class="status-field-value mono-text">${formatPanId(this.otConfig?.panid)}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Mesh Local Prefix</span>
                          <span class="status-field-value mono-text">${this.otConfig?.meshLocalPrefix ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">PSKc</span>
                          <span class="status-field-value mono-text">${this.otConfig?.pskc ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Channel</span>
                          <div class="status-channel-row">
                            <span class="status-field-value mono-text">${this.otConfig?.channel ?? "—"}</span>
                            <span class="status-channel-badge">2.4 GHz</span>
                          </div>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Channel Mask</span>
                          <span class="status-field-value mono-text">${this.otConfig?.channelMask ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Security Policy</span>
                          <span class="status-field-value mono-text">${this.otConfig?.securityPolicy ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Extended PAN ID</span>
                          <span class="status-field-value mono-text">${this.otConfig?.extendedPanId ?? "—"}</span>
                        </div>
                        <div class="status-field">
                          <span class="status-field-label">Active Timestamp</span>
                          <span class="status-field-value">${this.otConfig?.activeTimestamp ?? "—"}</span>
                        </div>
                        <div class="status-field status-field-version">
                          <span class="status-field-label">Thread Version</span>
                          <span class="status-field-value status-field-value--mono-small">${this.otConfig?.threadVersion ?? "—"}</span>
                        </div>
                      </div>
                    `}
            </div>
          </section>

          <section class="status-section status-section-system">
            <div class="status-section-ot-header">
              <h2 class="status-section-ot-title">
                <span class="material-symbols-outlined">computer</span>
                System
              </h2>
            </div>
            <div class="status-card status-card-ot">
              <div class="status-ot-grid status-ot-grid--system">
                <div class="status-field">
                  <span class="status-field-label">IPv4 (backend)</span>
                  <span class="status-field-value status-field-value--accent mono-text">
                    ${this.systemInfo?.ipv4?.length ? this.systemInfo.ipv4.join(", ") : "—"}
                  </span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">IPv6 (backend)</span>
                  <span class="status-field-value status-field-value--accent mono-text status-field-value--wrap">
                    ${this.systemInfo?.ipv6?.length ? this.systemInfo.ipv6.join(", ") : "—"}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "status-view": StatusComponent;
  }
}
