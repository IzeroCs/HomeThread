import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createLocaleController } from "@/store/locale-controller";
import { showToast } from "@/store/toast";
import { t } from "@/core/i18n/i18n";

import "@settings/thread/thread.style.scss";

@customElement("settings-thread-view")
export class SettingsThreadViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  @property({ type: Boolean }) isConnected = false;
  @property({ type: Object }) otConfig: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string; error?: string } | null = null;
  @property({ type: Boolean }) threadRunOnConnect = false;
  @property({ attribute: false }) getOtConfig: () => Promise<unknown> = async () => null;
  @property({ attribute: false }) setOtConfig: (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) startThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) stopThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) getThreadRunOnConnect: () => void = () => {};
  @property({ attribute: false }) setThreadRunOnConnect: (run: boolean) => void = () => {};

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
    if (result.success) showToast("success", t("settings.thread.toast.applySuccess"));
    else showToast("error", result.error ?? t("settings.thread.toast.applyFailedFallback"));
  }

  private async _handleThreadToggle(e: Event) {
    const newValue = (e.target as HTMLInputElement).checked;
    this.setThreadRunOnConnect(newValue);
    if (newValue) {
      const result = await this.startThread();
      if (result.success) showToast("success", t("settings.thread.toast.threadStarted"));
      else {
        showToast("error", result.error ?? t("settings.thread.toast.threadStartFailedFallback"));
        this.setThreadRunOnConnect(false);
      }
    } else {
      const result = await this.stopThread();
      if (result.success) showToast("success", t("settings.thread.toast.threadStopped"));
      else {
        showToast("error", result.error ?? t("settings.thread.toast.threadStopFailedFallback"));
        this.setThreadRunOnConnect(true);
      }
    }
  }

  render() {
    void this.locale.value;
    return html`
      <div class="form-page">
        <div class="form-page-header">
          <h2 class="form-page-title">${t("settings.thread.title")}</h2>
          <p class="form-page-description">${t("settings.thread.description")}</p>
        </div>
        ${!this.isConnected
          ? html`<div class="form-page-alert form-page-alert-warn">${t("settings.thread.notConnected")}</div>`
          : ""}
        ${this.message ? html`<div class="form-page-alert form-page-alert-${this.message.type}">${this.message.text}</div>` : ""}
        <div class="form-card settings-thread-card">
          <div class="settings-thread-card-header">
            <div class="settings-thread-card-title">
              <span class="settings-thread-card-title-icon" aria-hidden="true">
                <span class="material-symbols-outlined">device_hub</span>
              </span>
              <span>${t("settings.thread.networkParameters")}</span>
            </div>
            <div class="settings-thread-toggle-group">
              <span class="settings-thread-toggle-label">${t("settings.thread.threadToggleLabel")}</span>
              <label class="settings-thread-toggle">
                <input
                  type="checkbox"
                  ?checked=${this.threadRunOnConnect}
                  @change=${this._handleThreadToggle}
                  ?disabled=${!this.isConnected}
                />
                <span class="settings-thread-toggle-track"></span>
                <span class="settings-thread-toggle-thumb"></span>
              </label>
            </div>
          </div>
          <div class="settings-thread-card-body form-page-form">
            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="settings-thread-panid">${t("settings.thread.panIdLabel")}</label>
                <input
                  id="settings-thread-panid"
                  type="text"
                  class="form-control form-control--mono"
                  .value=${this.panid}
                  @input=${(e: Event) => (this.panid = (e.target as HTMLInputElement).value)}
                  placeholder=${t("settings.thread.placeholders.panId")}
                  ?disabled=${!this.isConnected}
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="settings-thread-channel">${t("settings.thread.channelLabel")}</label>
                <input
                  id="settings-thread-channel"
                  type="number"
                  min="11"
                  max="26"
                  class="form-control form-control--mono"
                  .value=${this.channel}
                  @input=${(e: Event) => (this.channel = parseInt((e.target as HTMLInputElement).value, 10) || 11)}
                  ?disabled=${!this.isConnected}
                />
              </div>
            </div>
            <div class="form-field">
              <label class="form-label" for="settings-thread-networkname">${t("settings.thread.networkNameLabel")}</label>
              <input
                id="settings-thread-networkname"
                type="text"
                class="form-control"
                .value=${this.networkName}
                @input=${(e: Event) => (this.networkName = (e.target as HTMLInputElement).value)}
                placeholder=${t("settings.thread.placeholders.networkName")}
                ?disabled=${!this.isConnected}
              />
            </div>
            <div class="form-field">
              <label class="form-label" for="settings-thread-extendedpanid">${t("settings.thread.extendedPanIdLabel")}</label>
              <input
                id="settings-thread-extendedpanid"
                type="text"
                class="form-control form-control--mono"
                .value=${this.extendedPanId}
                @input=${(e: Event) => (this.extendedPanId = (e.target as HTMLInputElement).value)}
                placeholder=${t("settings.thread.placeholders.extendedPanId")}
                ?disabled=${!this.isConnected}
              />
            </div>
            <div class="form-field">
              <label class="form-label" for="settings-thread-networkkey">${t("settings.thread.networkKeyLabel")}</label>
              <div class="form-control-wrap form-control-wrap--trailing">
                <input
                  id="settings-thread-networkkey"
                  type=${this.showNetworkKey ? "text" : "password"}
                  class="form-control form-control--mono"
                  .value=${this.networkKey}
                  @input=${(e: Event) => (this.networkKey = (e.target as HTMLInputElement).value)}
                  placeholder=${t("settings.thread.placeholders.networkKey")}
                  ?disabled=${!this.isConnected}
                />
                <button
                  type="button"
                  class="settings-thread-eye-btn"
                  @click=${() => (this.showNetworkKey = !this.showNetworkKey)}
                  title=${this.showNetworkKey ? t("settings.thread.hideKey") : t("settings.thread.showKey")}
                  aria-label=${this.showNetworkKey ? t("settings.thread.hideKey") : t("settings.thread.showKey")}
                >
                  <span class="material-symbols-outlined" aria-hidden>${this.showNetworkKey ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
              <p class="form-helper">${t("settings.thread.networkKeyHint")}</p>
            </div>
          </div>
          <div class="settings-thread-card-footer">
            <button type="button" class="form-btn form-btn--ghost" @click=${this._handleLoad} ?disabled=${!this.isConnected || this.loading}>
              ${this.loading ? t("settings.thread.loading") : t("settings.thread.reload")}
            </button>
            <button type="button" class="form-btn form-btn--primary" @click=${this._handleApply} ?disabled=${!this.isConnected || this.applying}>
              ${this.applying ? t("settings.thread.applying") : t("settings.thread.apply")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-thread-view": SettingsThreadViewComponent;
  }
}
