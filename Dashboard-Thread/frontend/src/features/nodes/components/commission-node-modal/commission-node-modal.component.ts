import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "@nodes/components/commission-node-modal/commission-node-modal.style.scss";

const DEFAULT_EUI64 = "f0f5bdfffe104b24";
const DEFAULT_PSK = "H01THREAD";
const TIMEOUT_OPTIONS = [60, 120, 300] as const;
const DEFAULT_TIMEOUT = 60;

@customElement("commission-node-modal")
export class CommissionNodeModalComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) open = false;
  @property({ attribute: false }) onClose: () => void = () => {};
  @property({ type: String }) threadState: string | null = null;
  @property({ attribute: false }) commissionerConnect: (eui64: string, psk: string, timeoutSeconds?: number) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};

  @state() private eui64 = DEFAULT_EUI64;
  @state() private psk = DEFAULT_PSK;
  @state() private timeoutSeconds: (typeof TIMEOUT_OPTIONS)[number] = DEFAULT_TIMEOUT;
  @state() private connecting = false;

  private get _isLeader(): boolean {
    return this.threadState?.toLowerCase() === "leader";
  }

  private _handleClose() {
    if (this.connecting) return;
    this.eui64 = DEFAULT_EUI64;
    this.psk = DEFAULT_PSK;
    this.timeoutSeconds = DEFAULT_TIMEOUT;
    this.onClose();
  }

  private async _handleConnect() {
    if (!this.eui64.trim() || !this.psk.trim()) {
      this.showToast("error", "EUI64 và PSK không được để trống.");
      return;
    }
    this.connecting = true;
    const result = await this.commissionerConnect(this.eui64.trim(), this.psk.trim(), this.timeoutSeconds);
    this.connecting = false;
    if (result.success) {
      this.showToast("success", "Đã thêm joiner. Thiết bị có thể kết nối mạng.");
      this._handleClose();
    } else {
      this.showToast("error", result.error ?? "Kết nối thất bại.");
    }
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div
        class="commission-node-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-node-modal-title"
        @click=${(e: Event) => e.target === e.currentTarget && this._handleClose()}
      >
        <div class="commission-node-card commission-node-modal-card">
          <div class="commission-node-header">
            <div class="commission-node-header-text">
              <h3 id="commission-node-modal-title" class="commission-node-title">Commission Node</h3>
              <p class="commission-node-subtitle">Enter Joiner credentials to add a new device.</p>
            </div>
            <button type="button" class="commission-node-close" @click=${this._handleClose} ?disabled=${this.connecting} aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="commission-node-body">
            ${!this._isLeader
              ? html`
                  <div class="commission-node-alert commission-node-alert-warn">
                    Commissioner chỉ khả dụng khi thiết bị ở state <strong>leader</strong>.
                    ${this.threadState ? ` State hiện tại: ${this.threadState}.` : " Đang lấy state…"}
                  </div>
                `
              : ""}
            <div class="commission-node-form">
              <div class="commission-node-field">
                <label class="commission-node-label" for="commission-modal-eui64">Joiner EUI64 <span class="commission-node-required">*</span></label>
                <div class="commission-node-input-wrap">
                  <span class="material-symbols-outlined commission-node-input-icon" aria-hidden>qr_code_2</span>
                  <input
                    id="commission-modal-eui64"
                    type="text"
                    class="commission-node-input"
                    .value=${this.eui64}
                    @input=${(e: Event) => (this.eui64 = (e.target as HTMLInputElement).value)}
                    placeholder="e.g. d431f4e1f7481234"
                    autocomplete="off"
                    spellcheck="false"
                    ?disabled=${this.connecting || !this._isLeader}
                  />
                </div>
                <p class="commission-node-helper">The unique identifier for the device.</p>
              </div>
              <div class="commission-node-field">
                <label class="commission-node-label" for="commission-modal-psk">Joiner PIN <span class="commission-node-required">*</span></label>
                <div class="commission-node-input-wrap">
                  <span class="material-symbols-outlined commission-node-input-icon" aria-hidden>pin</span>
                  <input
                    id="commission-modal-psk"
                    type="text"
                    class="commission-node-input"
                    .value=${this.psk}
                    @input=${(e: Event) => (this.psk = (e.target as HTMLInputElement).value)}
                    placeholder="e.g. J01NME"
                    autocomplete="off"
                    ?disabled=${this.connecting || !this._isLeader}
                  />
                </div>
                <p class="commission-node-helper">The commissioning credential provided with the device.</p>
              </div>
              <div class="commission-node-field">
                <label class="commission-node-label" for="commission-modal-timeout">Commissioning Timeout</label>
                <div class="commission-node-select-wrap">
                  <select
                    id="commission-modal-timeout"
                    class="commission-node-select"
                    .value=${String(this.timeoutSeconds)}
                    @change=${(e: Event) => (this.timeoutSeconds = Number((e.target as HTMLSelectElement).value) as (typeof TIMEOUT_OPTIONS)[number])}
                    ?disabled=${this.connecting || !this._isLeader}
                    aria-label="Commissioning timeout"
                  >
                    ${TIMEOUT_OPTIONS.map((sec) => html`<option value="${sec}">${sec} seconds</option>`)}
                  </select>
                  <span class="material-symbols-outlined commission-node-select-icon" aria-hidden>expand_more</span>
                </div>
              </div>
              <div class="commission-node-info">
                <span class="material-symbols-outlined commission-node-info-icon" aria-hidden>info</span>
                <p class="commission-node-info-text">Ensure the joining device is powered on and in range of a router.</p>
              </div>
            </div>
          </div>
          <div class="commission-node-footer">
            <button type="button" class="commission-node-btn commission-node-btn-secondary" @click=${this._handleClose} ?disabled=${this.connecting}>
              Cancel
            </button>
            <button
              type="button"
              class="commission-node-btn commission-node-btn-primary"
              @click=${this._handleConnect}
              ?disabled=${this.connecting || !this._isLeader}
            >
              ${this.connecting
                ? html`<span class="commission-node-connect-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span> Connecting…`
                : html`<span class="material-symbols-outlined commission-node-btn-icon" aria-hidden>play_arrow</span> Start Commissioning`}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "commission-node-modal": CommissionNodeModalComponent;
  }
}
