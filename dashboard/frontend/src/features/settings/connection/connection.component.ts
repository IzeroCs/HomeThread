import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BR_CONNECTION } from "shared/src/constants";
import { validateBrConnectionConfig } from "shared/src/validation";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { store } from "@/store/store";
import { showToast } from "@namorix/core";
import { wsEmitConfigSave } from "@/store/thunks/ws.emit";
import { wsTestBrConnect } from "@/store/thunks/ws.thunks";
import { t } from "@/core/i18n/i18n";

import "@settings/connection/connection.style.scss";
import { LitStoreController } from "@namorix/core/store";
import { selectConfig } from "@/store/selectors";

interface SettingsConnectionConfigForm {
  host: string;
  port: number;
  useMdns?: boolean;
}

const DEFAULT_CONNECTION_CONFIG: SettingsConnectionConfigForm = {
  host: "Thread-Host.local",
  port: BR_CONNECTION.DEFAULT_PORT,
  useMdns: true,
};

function getFormErrors(formData: SettingsConnectionConfigForm): Partial<Record<keyof SettingsConnectionConfigForm, string>> {
  const err = validateBrConnectionConfig({ brHost: formData.host, brPort: formData.port });
  if (!err) return {};
  return { host: err, port: err };
}

@customElement("settings-connection-view")
export class SettingsConnectionViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);
  private readonly configController = new LitStoreController(this, store, (s) => selectConfig(s), Object.is);

  @state() private formData: SettingsConnectionConfigForm = DEFAULT_CONNECTION_CONFIG;
  @state() private errors: Partial<Record<keyof SettingsConnectionConfigForm, string>> = {};
  @state() private testStatus: { type: "idle" | "loading" | "success" | "error"; message?: string } = { type: "idle" };
  @state() private testSucceeded = false;
  private _configSynced = false;

  override willUpdate() {
    const config = this.configController.value;
    if (config) {
      if (!this._configSynced) {
        this.formData = {
          host: config.brHost,
          port: config.brPort,
          useMdns: config.useMdns,
        };
        this._configSynced = true;
      }
    } else {
      this._configSynced = false;
    }
  }

  private _handleFieldChange<K extends keyof SettingsConnectionConfigForm>(field: K, value: SettingsConnectionConfigForm[K]) {
    this.formData = { ...this.formData, [field]: value };
    this.testSucceeded = false;
  }

  private _handleSubmit(e: Event) {
    e.preventDefault();
    const newErrors = getFormErrors(this.formData);
    if (Object.keys(newErrors).length > 0) {
      this.errors = newErrors;
      const firstError = Object.values(newErrors)[0];
      if (firstError) showToast("error", firstError);
      return;
    }
    this.errors = {};
    this.testStatus = { type: "idle" };
    wsEmitConfigSave({
      brHost: this.formData.host,
      brPort: this.formData.port,
      useMdns: this.formData.useMdns,
    });
    showToast("success", t("settings.connection.toast.saved"));
  }

  private async _handleTestConnect() {
    const newErrors = getFormErrors(this.formData);
    if (Object.keys(newErrors).length > 0) {
      this.errors = newErrors;
      const firstError = Object.values(newErrors)[0];
      if (firstError) showToast("error", firstError);
      return;
    }
    this.errors = {};
    this.testStatus = { type: "loading" };
    try {
      const result = await store.dispatch(
        wsTestBrConnect({ brHost: this.formData.host, brPort: this.formData.port })
      ).unwrap();
      if (result.success) {
        this.testStatus = { type: "success", message: t("settings.connection.testStatus.success") };
        this.testSucceeded = true;
        showToast("success", t("settings.connection.toast.testSuccess"));
      } else {
        this.testStatus = { type: "error", message: result.error ?? t("settings.connection.testStatus.failedFallback") };
        this.testSucceeded = false;
        showToast("error", result.error ?? t("settings.connection.toast.testFailedFallback"));
      }
    } catch {
      this.testStatus = { type: "error", message: t("settings.connection.testStatus.failedFallback") };
      this.testSucceeded = false;
      showToast("error", t("settings.connection.errors.testNotAvailable"));
    }
  }

  private get _canSave(): boolean {
    return this.testSucceeded;
  }

  private get _alertMessage(): string | null {
    if (this.testStatus.type === "error") return this.testStatus.message ?? null;
    if (Object.keys(this.errors).length > 0) return this.errors.host || this.errors.port || t("settings.connection.errors.checkFieldsFallback");
    return null;
  }

  render() {
    void this.locale.value;
    const alertMessage = this._alertMessage;
    const canSave = this._canSave;

    return html`
      <div class="nmx-form-page">
        <div class="nmx-form-page-header">
          <h2 class="nmx-form-page-title">${t("settings.connection.title")}</h2>
          <p class="nmx-form-page-description">${t("settings.connection.description")}</p>
        </div>

        ${alertMessage
          ? html`<div class="nmx-form-page-alert nmx-form-page-alert-error" role="alert">${alertMessage}</div>`
          : ""}

        <div class="nmx-form-card settings-connection-card">
          <form @submit=${this._handleSubmit} class="nmx-form-page-form">
            <div class="nmx-form-row-2">
              <div class="nmx-form-field">
                <label class="nmx-form-label" for="settings-connection-host">${t("settings.connection.fields.hostLabel")}</label>
                <input
                  type="text"
                  id="settings-connection-host"
                  class="nmx-form-control ${this.errors.host ? "error" : ""}"
                  .value=${this.formData.host}
                  @input=${(e: Event) => this._handleFieldChange("host", (e.target as HTMLInputElement).value)}
                  placeholder=${t("settings.connection.fields.hostPlaceholder")}
                />
                ${this.errors.host ? html`<p class="nmx-form-error-message">${this.errors.host}</p>` : ""}
                <p class="nmx-form-helper">${t("settings.connection.fields.hostHint")}</p>
              </div>
              <div class="nmx-form-field">
                <label class="nmx-form-label" for="settings-connection-port">${t("settings.connection.fields.portLabel")}</label>
                <input
                  type="number"
                  id="settings-connection-port"
                  class="nmx-form-control ${this.errors.port ? "error" : ""}"
                  .value=${this.formData.port}
                  @input=${(e: Event) =>
                    this._handleFieldChange("port", parseInt((e.target as HTMLInputElement).value, 10) || BR_CONNECTION.DEFAULT_PORT)}
                  min=${BR_CONNECTION.MIN_PORT}
                  max=${BR_CONNECTION.MAX_PORT}
                />
                ${this.errors.port ? html`<p class="nmx-form-error-message">${this.errors.port}</p>` : ""}
                <p class="nmx-form-helper">${t("settings.connection.fields.portHint", { defaultPort: BR_CONNECTION.DEFAULT_PORT })}</p>
              </div>
            </div>
            <div class="nmx-form-info-box">
              <span class="material-symbols-outlined nmx-form-info-box__icon" aria-hidden="true">info</span>
              <p class="nmx-form-info-box__text">${t("settings.connection.note")}</p>
            </div>
            <div class="nmx-form-actions">
              <button
                type="button"
                class="nmx-form-btn nmx-form-btn--ghost settings-connection-test-btn"
                @click=${this._handleTestConnect}
                ?disabled=${this.testStatus.type === "loading"}
              >
                <span class="settings-connection-test-dot" aria-hidden="true"></span>
                ${this.testStatus.type === "loading" ? t("settings.connection.actions.testing") : t("settings.connection.actions.test")}
              </button>
              <button type="submit" class="nmx-form-btn nmx-form-btn--primary" ?disabled=${!canSave}>
                ${t("settings.connection.actions.save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-connection-view": SettingsConnectionViewComponent;
  }
}
