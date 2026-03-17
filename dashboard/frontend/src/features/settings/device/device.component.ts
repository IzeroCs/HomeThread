import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@shared/components/confirm-modal/confirm-modal.component";
import { LitStoreController } from "@/shared/store/lit-store-controller";
import { store } from "@/shared/store/store";
import { selectLocale } from "@/shared/store/selectors";
import { t } from "@/shared/i18n/i18n";

import "@settings/device/device.style.scss";

type ConfirmAction = "reset" | "factory" | null;

@customElement("settings-device-view")
export class SettingsDeviceViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = new LitStoreController(
    this,
    store,
    (s) => selectLocale(s),
    Object.is
  );

  @property({ type: Boolean }) isConnected = false;
  @property({ attribute: false }) reset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) factoryReset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error", message: string) => void = () => {};

  @state() private confirmAction: ConfirmAction = null;
  @state() private loading = false;

  private async _handleConfirm() {
    if (!this.confirmAction) return;
    const action = this.confirmAction;
    this.confirmAction = null;
    this.loading = true;
    try {
      const result = action === "reset" ? await this.reset() : await this.factoryReset();
      if (result.success) {
        this.showToast(
          "success",
          action === "reset" ? t("settings.system.toast.resetSent") : t("settings.system.toast.factorySent")
        );
      } else {
        this.showToast("error", result.error ?? t("settings.system.toast.failedFallback"));
      }
    } finally {
      this.loading = false;
    }
  }

  render() {
    void this.locale.value;
    return html`
      <div class="form-page system-page">
        <div class="system-page-header">
          <h2 class="system-page-title">${t("settings.system.title")}</h2>
          <p class="system-page-description">${t("settings.system.description")}</p>
          ${!this.isConnected ? html`<p class="system-page-hint">${t("settings.system.notConnectedHint")}</p>` : ""}
        </div>
        <div class="system-action-card system-card-restart">
          <div class="system-card-image">
            <div class="bg-img"></div>
            <div class="icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </div>
            <div class="dot-indicator">
              <div class="dot active"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          </div>
          <div class="system-card-content">
            <div class="system-card-info">
              <h3>${t("settings.system.restartTitle")}</h3>
              <p>${t("settings.system.restartDescription")}</p>
            </div>
            <div class="system-card-action">
              <button type="button" class="system-btn system-btn-orange" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "reset")}>
                ${t("settings.system.actions.reset")}
              </button>
            </div>
          </div>
        </div>
        <div class="system-danger-divider"><span>${t("settings.system.dangerZone")}</span></div>
        <div class="system-action-card system-card-factory">
          <div class="system-card-image">
            <div class="bg-img"></div>
            <div class="icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM5 13h14c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2zm7 5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z" />
              </svg>
            </div>
          </div>
          <div class="system-card-content">
            <div class="system-card-info">
              <h3>${t("settings.system.factoryTitle")}</h3>
              <p>
                ${t("settings.system.factoryDescription")}
                <span class="warning-inline">${t("settings.system.cannotUndo")}</span>
              </p>
            </div>
            <div class="system-card-action">
              <button type="button" class="system-btn system-btn-red" ?disabled=${!this.isConnected || this.loading} @click=${() => (this.confirmAction = "factory")}>
                ${t("settings.system.actions.factoryReset")}
              </button>
            </div>
          </div>
        </div>
        <confirm-modal
          .open=${this.confirmAction === "reset"}
          .onClose=${() => !this.loading && (this.confirmAction = null)}
          title=${t("settings.system.confirmRestartTitle")}
          message=${t("settings.system.confirmRestartMessage")}
          confirmLabel=${t("settings.system.actions.reset")}
          variant="warning"
          .loading=${this.loading}
          .onConfirm=${this._handleConfirm}
        ></confirm-modal>
        <confirm-modal
          .open=${this.confirmAction === "factory"}
          .onClose=${() => !this.loading && (this.confirmAction = null)}
          title=${t("settings.system.factoryTitle")}
          message=${t("settings.system.confirmFactoryMessage")}
          confirmLabel=${t("settings.system.actions.factoryReset")}
          variant="danger"
          .loading=${this.loading}
          .onConfirm=${this._handleConfirm}
        ></confirm-modal>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-device-view": SettingsDeviceViewComponent;
  }
}
