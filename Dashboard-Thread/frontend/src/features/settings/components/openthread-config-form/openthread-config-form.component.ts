import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "@settings/components/openthread-config-form/openthread-config-form.style.scss";

@customElement("openthread-config-form")
export class OpenThreadConfigFormComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) isConnected = false;
  @property({ type: Object }) otConfig: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string; error?: string } | null = null;
  @property({ type: Boolean }) threadRunOnConnect = false;
  @property({ attribute: false }) getOtConfig: () => Promise<unknown> = async () => null;
  @property({ attribute: false }) setOtConfig: (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) startThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) stopThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) getThreadRunOnConnect: () => void = () => {};
  @property({ attribute: false }) setThreadRunOnConnect: (run: boolean) => void = () => {};
  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};

  @state() private panid = "";
  @state() private channel = 11;
  @state() private networkName = "";
  @state() private extendedPanId = "";
  @state() private networkKey = "";
  @state() private loading = false;
  @state() private applying = false;
  @state() private message: { type: "success" | "error"; text: string } | null = null;
  @state() private showNetworkKey = false;

  override connectedCallback() {
    super.connectedCallback();
    if (this.isConnected) this.getOtConfig();
    this.getThreadRunOnConnect();
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("otConfig") && this.otConfig) {
      if (this.otConfig.error) this.message = { type: "error", text: this.otConfig.error };
      else {
        if (this.otConfig.panid != null) this.panid = this.otConfig.panid;
        if (this.otConfig.channel != null) this.channel = this.otConfig.channel;
        if (this.otConfig.networkName != null) this.networkName = this.otConfig.networkName;
        if (this.otConfig.extendedPanId != null) this.extendedPanId = this.otConfig.extendedPanId;
        if (this.otConfig.networkKey != null) this.networkKey = this.otConfig.networkKey;
      }
    }
  }

  private async _handleLoad() {
    this.message = null;
    this.loading = true;
    try {
      await this.getOtConfig();
    } finally {
      this.loading = false;
    }
  }

  private async _handleApply() {
    this.message = null;
    this.applying = true;
    const result = await this.setOtConfig({
      panid: this.panid.trim() || undefined,
      channel: this.channel >= 11 && this.channel <= 26 ? this.channel : undefined,
      networkName: this.networkName.trim() || undefined,
      extendedPanId: this.extendedPanId.trim() || undefined,
      networkKey: this.networkKey.trim() || undefined,
    });
    this.applying = false;
    if (result.success) this.showToast("success", "Đã áp dụng cấu hình thành công.");
    else this.showToast("error", result.error ?? "Áp dụng thất bại.");
  }

  private async _handleThreadToggle(e: Event) {
    const newValue = (e.target as HTMLInputElement).checked;
    this.setThreadRunOnConnect(newValue);
    if (newValue) {
      const result = await this.startThread();
      if (result.success) this.showToast("success", "Đã khởi động Thread.");
      else {
        this.showToast("error", result.error ?? "Không thể khởi động Thread.");
        this.setThreadRunOnConnect(false);
      }
    } else {
      const result = await this.stopThread();
      if (result.success) this.showToast("success", "Đã dừng Thread.");
      else {
        this.showToast("error", result.error ?? "Không thể dừng Thread.");
        this.setThreadRunOnConnect(true);
      }
    }
  }

  render() {
    return html`
      <div class="form-page">
        <div class="form-page-header">
          <h2 class="form-page-title">Cấu hình mạng Thread</h2>
          <p class="form-page-description">
            Quản lý thông số kỹ thuật và trạng thái hoạt động của mạng Mesh trong môi trường OpenThread.
          </p>
        </div>
        ${!this.isConnected
          ? html`<div class="form-page-alert form-page-alert-warn">Chưa kết nối BR. Vào Status/Nodes để kết nối rồi quay lại đây.</div>`
          : ""}
        ${this.message ? html`<div class="form-page-alert form-page-alert-${this.message.type}">${this.message.text}</div>` : ""}
        <div class="form-card ot-card">
          <div class="ot-card-header">
            <div class="ot-card-title">
              <span class="ot-card-title-icon" aria-hidden="true">
                <span class="material-symbols-outlined">device_hub</span>
              </span>
              <span>Thông số mạng</span>
            </div>
            <div class="ot-toggle-group">
              <span class="ot-toggle-label">Khởi động Thread</span>
              <label class="ot-toggle">
                <input
                  type="checkbox"
                  ?checked=${this.threadRunOnConnect}
                  @change=${this._handleThreadToggle}
                  ?disabled=${!this.isConnected}
                />
                <span class="ot-toggle-track"></span>
                <span class="ot-toggle-thumb"></span>
              </label>
            </div>
          </div>
          <div class="ot-card-body form-page-form">
            <div class="form-row-2">
              <div class="form-group ot-field-group">
                <label for="ot-panid">PAN ID</label>
                <div class="ot-input-wrap">
                  <input
                    id="ot-panid"
                    type="text"
                    .value=${this.panid}
                    @input=${(e: Event) => (this.panid = (e.target as HTMLInputElement).value)}
                    placeholder="0x1986"
                    ?disabled=${!this.isConnected}
                  />
                </div>
              </div>
              <div class="form-group ot-field-group">
                <label for="ot-channel">Kênh (Channel)</label>
                <div class="ot-input-wrap">
                  <input
                    id="ot-channel"
                    type="number"
                    min="11"
                    max="26"
                    .value=${this.channel}
                    @input=${(e: Event) => (this.channel = parseInt((e.target as HTMLInputElement).value, 10) || 11)}
                    ?disabled=${!this.isConnected}
                  />
                </div>
              </div>
            </div>
            <div class="form-group ot-field-group">
              <label for="ot-networkname">Tên mạng (Network Name)</label>
              <div class="ot-input-wrap">
                <input
                  id="ot-networkname"
                  type="text"
                  .value=${this.networkName}
                  @input=${(e: Event) => (this.networkName = (e.target as HTMLInputElement).value)}
                  placeholder="OpenThread-Mesh"
                  ?disabled=${!this.isConnected}
                />
              </div>
            </div>
            <div class="form-group ot-field-group">
              <label for="ot-extendedpanid">Extended PAN ID</label>
              <div class="ot-input-wrap">
                <input
                  id="ot-extendedpanid"
                  type="text"
                  .value=${this.extendedPanId}
                  @input=${(e: Event) => (this.extendedPanId = (e.target as HTMLInputElement).value)}
                  placeholder="DEADBEEF00112233"
                  ?disabled=${!this.isConnected}
                />
              </div>
            </div>
            <div class="form-group ot-field-group">
              <label for="ot-networkkey">Khóa mạng (Network Key)</label>
              <div class="ot-input-wrap">
                <input
                  id="ot-networkkey"
                  type=${this.showNetworkKey ? "text" : "password"}
                  .value=${this.networkKey}
                  @input=${(e: Event) => (this.networkKey = (e.target as HTMLInputElement).value)}
                  placeholder="00112233445566778899AABBCCDDEEFF"
                  ?disabled=${!this.isConnected}
                />
                <button
                  type="button"
                  class="ot-eye-btn"
                  @click=${() => (this.showNetworkKey = !this.showNetworkKey)}
                  title=${this.showNetworkKey ? "Ẩn khóa" : "Hiện khóa"}
                >
                  <span class="material-symbols-outlined">${this.showNetworkKey ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              <span class="ot-field-hint">Khóa mạng được mã hóa để đảm bảo an toàn.</span>
            </div>
          </div>
          <div class="ot-card-footer">
            <button type="button" class="form-btn form-btn--ghost" @click=${this._handleLoad} ?disabled=${!this.isConnected || this.loading}>
              ${this.loading ? "Đang tải…" : "Lấy lại"}
            </button>
            <button type="button" class="form-btn form-btn--primary" @click=${this._handleApply} ?disabled=${!this.isConnected || this.applying}>
              ${this.applying ? "Đang áp dụng…" : "Áp dụng"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "openthread-config-form": OpenThreadConfigFormComponent;
  }
}
