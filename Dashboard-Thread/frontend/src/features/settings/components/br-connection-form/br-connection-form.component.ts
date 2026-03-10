import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DEFAULT_BR_CONFIG, type BrConnectionConfigForm } from "@settings/utils/br-connection-config.util";
import type { BrConnectionConfigFromBackend } from "@shared/types/websocket.type";
import { BR_CONNECTION } from "shared/src/constants";
import { validateBrConnectionConfig } from "shared/src/validation";

import "@settings/components/br-connection-form/br-connection-form.style.scss";

function getFormErrors(formData: BrConnectionConfigForm): Partial<Record<keyof BrConnectionConfigForm, string>> {
  const err = validateBrConnectionConfig(formData);
  if (!err) return {};
  return { brHost: err, brPort: err };
}

@customElement("br-connection-form")
export class BrConnectionFormComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Object }) initialConfig: BrConnectionConfigFromBackend | null = null;
  @property({ attribute: false }) onSave: (config: BrConnectionConfigForm) => void = () => {};
  @property({ attribute: false }) onTestConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error" | "warning" | "info", message: string, duration?: number) => void = () => {};

  @state() private formData: BrConnectionConfigForm = DEFAULT_BR_CONFIG;
  @state() private errors: Partial<Record<keyof BrConnectionConfigForm, string>> = {};
  @state() private testStatus: { type: "idle" | "loading" | "success" | "error"; message?: string } = { type: "idle" };
  @state() private testSucceeded = false;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("initialConfig")) {
      if (this.initialConfig) {
        this.formData = {
          brHost: this.initialConfig.brHost,
          brPort: this.initialConfig.brPort,
          useMdns: this.initialConfig.useMdns,
        };
      } else {
        this.formData = DEFAULT_BR_CONFIG;
      }
    }
  }

  private _handleFieldChange<K extends keyof BrConnectionConfigForm>(field: K, value: BrConnectionConfigForm[K]) {
    this.formData = { ...this.formData, [field]: value };
    this.testSucceeded = false;
  }

  private _handleSubmit(e: Event) {
    e.preventDefault();
    const newErrors = getFormErrors(this.formData);
    if (Object.keys(newErrors).length > 0) {
      this.errors = newErrors;
      const firstError = Object.values(newErrors)[0];
      if (firstError) this.showToast("error", firstError);
      return;
    }
    this.errors = {};
    this.testStatus = { type: "idle" };
    this.onSave(this.formData);
    this.showToast("success", "Đã lưu cấu hình BR.");
  }

  private async _handleTestConnect() {
    const newErrors = getFormErrors(this.formData);
    if (Object.keys(newErrors).length > 0) {
      this.errors = newErrors;
      const firstError = Object.values(newErrors)[0];
      if (firstError) this.showToast("error", firstError);
      return;
    }
    this.errors = {};
    if (!this.onTestConnect) {
      this.showToast("error", "Test connect not available");
      return;
    }
    this.testStatus = { type: "loading" };
    const result = await this.onTestConnect({ brHost: this.formData.brHost, brPort: this.formData.brPort });
    if (result.success) {
      this.testStatus = { type: "success", message: "Connection successful" };
      this.testSucceeded = true;
      this.showToast("success", "Kết nối BR thành công!");
    } else {
      this.testStatus = { type: "error", message: result.error ?? "Connection failed" };
      this.testSucceeded = false;
      this.showToast("error", result.error ?? "Kết nối thất bại.");
    }
  }

  private get _canSave(): boolean {
    return !this.onTestConnect || this.testSucceeded;
  }

  private get _alertMessage(): string | null {
    if (this.testStatus.type === "error") return this.testStatus.message ?? null;
    if (Object.keys(this.errors).length > 0) return this.errors.brHost || this.errors.brPort || "Please check the fields below.";
    return null;
  }

  render() {
    const alertMessage = this._alertMessage;
    const canSave = this._canSave;

    return html`
      <div class="form-page">
        <div class="form-page-header">
          <h2 class="form-page-title">BR Connection (TCP)</h2>
          <p class="form-page-description">
            Configure your Border Router TCP connection settings and network parameters.
          </p>
        </div>

        ${alertMessage
          ? html`<div class="form-page-alert form-page-alert-error" role="alert">${alertMessage}</div>`
          : ""}

        <div class="form-card br-connection-card">
          <form @submit=${this._handleSubmit} class="form-page-form">
            <div class="form-row-2 br-fields-row">
              <div class="form-group">
                <label for="brHost">BR Host</label>
                <input
                  type="text"
                  id="brHost"
                  .value=${this.formData.brHost}
                  @input=${(e: Event) => this._handleFieldChange("brHost", (e.target as HTMLInputElement).value)}
                  placeholder="Thread-Host.local"
                  class=${this.errors.brHost ? "error" : ""}
                />
                ${this.errors.brHost ? html`<span class="error-message">${this.errors.brHost}</span>` : ""}
                <small class="form-hint">DNS name or static IPv6 address of the Border Router.</small>
              </div>
              <div class="form-group">
                <label for="brPort">Port</label>
                <input
                  type="number"
                  id="brPort"
                  .value=${this.formData.brPort}
                  @input=${(e: Event) =>
                    this._handleFieldChange("brPort", parseInt((e.target as HTMLInputElement).value, 10) || BR_CONNECTION.DEFAULT_PORT)}
                  min=${BR_CONNECTION.MIN_PORT}
                  max=${BR_CONNECTION.MAX_PORT}
                  class=${this.errors.brPort ? "error" : ""}
                />
                ${this.errors.brPort ? html`<span class="error-message">${this.errors.brPort}</span>` : ""}
                <small class="form-hint">Standard TCP port for OpenThread management (default: ${BR_CONNECTION.DEFAULT_PORT}).</small>
              </div>
            </div>
            <div class="br-divider"></div>
            <div class="br-connection-note">
              <div class="br-connection-note-icon" aria-hidden="true">
                <span class="material-symbols-outlined">info</span>
              </div>
              <p class="br-connection-note-text">
                Changing these settings will restart the monitoring service. Ensure the Border Router is accessible from this network before saving.
              </p>
            </div>
            <div class="br-connection-actions">
              ${this.onTestConnect
                ? html`
                    <button
                      type="button"
                      class="form-btn form-btn--ghost br-test-connect"
                      @click=${this._handleTestConnect}
                      ?disabled=${this.testStatus.type === "loading"}
                    >
                      <span class="test-status-dot" aria-hidden="true"></span>
                      ${this.testStatus.type === "loading" ? "Testing…" : "Test Connection"}
                    </button>
                  `
                : ""}
              <button type="submit" class="form-btn form-btn--primary br-submit" ?disabled=${this.onTestConnect ? !canSave : false}>
                Save Configuration
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
    "br-connection-form": BrConnectionFormComponent;
  }
}
