import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { showToast } from "@namorix/core";
import { t } from "@/core/i18n/i18n";

import "@namorix/core/components/modal";
import "@settings/device/device.style.scss";

type ConfirmAction = "reset" | "factory" | null;

const COUNTDOWN_SECONDS = 5;

@customElement("settings-device-view")
export class SettingsDeviceViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  @property({ type: Boolean }) isConnected = false;
  @property({ attribute: false }) reset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) factoryReset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });

  @state() private confirmAction: ConfirmAction = null;
  @state() private loading = false;
  @state() private countdown = COUNTDOWN_SECONDS;

  private _intervalId: ReturnType<typeof setInterval> | null = null;

  private async _handleConfirm() {
    if (!this.confirmAction) return;
    const action = this.confirmAction;
    this.confirmAction = null;
    this.loading = true;
    try {
      const result = action === "reset" ? await this.reset() : await this.factoryReset();
      if (result.success) {
        showToast(
          "success",
          action === "reset" ? t("settings.device.toast.resetSent") : t("settings.device.toast.factorySent")
        );
      } else {
        showToast("error", result.error ?? t("settings.device.toast.failedFallback"));
      }
    } finally {
      this.loading = false;
    }
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("confirmAction")) {
      this.countdown = COUNTDOWN_SECONDS;
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
      if (this.confirmAction) {
        this._intervalId = setInterval(() => {
          this.countdown = Math.max(0, this.countdown - 1);
          if (this.countdown <= 0 && this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
          }
        }, 1000);
      }
    }
  }

  override disconnectedCallback() {
    if (this._intervalId) clearInterval(this._intervalId);
    super.disconnectedCallback();
  }

  private _closeConfirm() {
    if (this.loading) return;
    this.confirmAction = null;
  }

  render() {
    void this.locale.value;
    const isConfirmOpen = this.confirmAction !== null;
    const isFactory = this.confirmAction === "factory";
    const confirmTitle = isFactory
      ? t("settings.device.factoryTitle")
      : t("settings.device.confirmRestartTitle");
    const confirmMessage = isFactory
      ? t("settings.device.confirmFactoryMessage")
      : t("settings.device.confirmRestartMessage");
    const confirmBaseLabel = isFactory
      ? t("settings.device.actions.factoryReset")
      : t("settings.device.actions.reset");
    const canConfirm = this.countdown === 0 && !this.loading;
    const confirmLabel =
      this.loading
        ? t("confirmModal.processing")
        : this.countdown > 0
          ? `${confirmBaseLabel} (${this.countdown}s)`
          : confirmBaseLabel;
    return html`
      <div class="nmx-form-page settings-device-page">
        <div class="nmx-form-page-header">
          <h2 class="nmx-form-page-title">${t("settings.device.title")}</h2>
          <p class="nmx-form-page-description">${t("settings.device.description")}</p>
        </div>
        ${!this.isConnected ? html`<div class="nmx-form-page-alert nmx-form-page-alert-warn" role="alert">${t("settings.device.notConnectedHint")}</div>` : ""}
        <div class="settings-device-action-card settings-device-card-restart">
          <div class="settings-device-card-image">
            <div class="settings-device-card-bg"></div>
            <div class="settings-device-card-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </div>
            <div class="settings-device-dot-indicator">
              <div class="settings-device-dot settings-device-dot--active"></div>
              <div class="settings-device-dot"></div>
              <div class="settings-device-dot"></div>
            </div>
          </div>
          <div class="settings-device-card-content">
            <div class="settings-device-card-info">
              <h3>${t("settings.device.restartTitle")}</h3>
              <p>${t("settings.device.restartDescription")}</p>
            </div>
            <div class="settings-device-card-action">
              <button type="button" class="settings-device-btn settings-device-btn-orange" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "reset")}>
                ${t("settings.device.actions.reset")}
              </button>
            </div>
          </div>
        </div>
        <div class="settings-device-danger-divider"><span>${t("settings.device.dangerZone")}</span></div>
        <div class="settings-device-action-card settings-device-card-factory">
          <div class="settings-device-card-image">
            <div class="settings-device-card-bg"></div>
            <div class="settings-device-card-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM5 13h14c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm7 5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
              </svg>
            </div>
          </div>
          <div class="settings-device-card-content">
            <div class="settings-device-card-info">
              <h3>${t("settings.device.factoryTitle")}</h3>
              <p>
                ${t("settings.device.factoryDescription")}
                <span class="settings-device-warning-inline">${t("settings.device.cannotUndo")}</span>
              </p>
            </div>
            <div class="settings-device-card-action">
              <button type="button" class="settings-device-btn settings-device-btn-red" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "factory")}>
                ${t("settings.device.actions.factoryReset")}
              </button>
            </div>
          </div>
        </div>
        <nmx-modal
          .open=${isConfirmOpen}
          .title=${confirmTitle}
          .body=${html`<p>${confirmMessage}</p>`}
          .cancelLabel=${t("modal.actions.cancel")}
          .confirmLabel=${confirmLabel}
          .closeAriaLabel=${t("modal.closeAriaLabel")}
          .onClose=${() => this._closeConfirm()}
          .cancelAction=${{
            label: t("confirmModal.cancelLabel"),
            onClick: () => this._closeConfirm(),
            disabled: this.loading,
            style: "text",
            tone: "default",
          }}
          .confirmAction=${{
            label: confirmLabel,
            onClick: () => this._handleConfirm(),
            disabled: !canConfirm,
            loading: this.loading,
            style: "filled",
            tone: isFactory ? "danger" : "warning",
          }}
        ></nmx-modal>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-device-view": SettingsDeviceViewComponent;
  }
}
