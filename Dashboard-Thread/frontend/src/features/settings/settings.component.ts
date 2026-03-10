import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import "@settings/components/br-connection-form/br-connection-form.component";
import "@settings/components/openthread-config-form/openthread-config-form.component";
import "@settings/components/system-tab/system-tab.component";
import type { BrConnectionConfigFromBackend } from "@shared/types/websocket.type";

import "@settings/settings.style.scss";

export type SettingsSection = "br" | "openthread" | "system";

@customElement("settings-view")
export class SettingsComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Object }) brConfig: BrConnectionConfigFromBackend | null = null;
  @property({ type: String }) activeSection: SettingsSection = "br";
  @property({ attribute: false }) onSaveBrConfig: (config: { brHost: string; brPort: number; useMdns?: boolean }) => void = () => {};
  @property({ attribute: false }) onTestBrConnect: (config: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) showToast: (type: "success" | "error" | "warning" | "info", message: string) => void = () => {};
  @property({ type: Boolean }) isConnected = false;
  @property({ type: Object }) otConfig: unknown = null;
  @property({ type: Boolean }) threadRunOnConnect = false;
  @property({ attribute: false }) getOtConfig: () => Promise<unknown> = async () => null;
  @property({ attribute: false }) setOtConfig: (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) startThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) stopThread: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) getThreadRunOnConnect: () => void = () => {};
  @property({ attribute: false }) setThreadRunOnConnect: (run: boolean) => void = () => {};
  @property({ attribute: false }) reset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });
  @property({ attribute: false }) factoryReset: () => Promise<{ success: boolean; error?: string }> = async () => ({ success: false });

  render() {
    return html`
      <div class="settings-page">
        <div class="settings-tab-content">
          ${this.activeSection === "br"
            ? html`
                <br-connection-form
                  .initialConfig=${this.brConfig}
                  .onSave=${this.onSaveBrConfig}
                  .onTestConnect=${this.onTestBrConnect}
                  .showToast=${this.showToast}
                ></br-connection-form>
              `
            : ""}
          ${this.activeSection === "openthread"
            ? html`
                <openthread-config-form
                  .isConnected=${this.isConnected}
                  .otConfig=${this.otConfig}
                  .threadRunOnConnect=${this.threadRunOnConnect}
                  .getOtConfig=${this.getOtConfig}
                  .setOtConfig=${this.setOtConfig}
                  .startThread=${this.startThread}
                  .stopThread=${this.stopThread}
                  .getThreadRunOnConnect=${this.getThreadRunOnConnect}
                  .setThreadRunOnConnect=${this.setThreadRunOnConnect}
                  .showToast=${this.showToast}
                ></openthread-config-form>
              `
            : ""}
          ${this.activeSection === "system"
            ? html`
                <system-tab
                  .isConnected=${this.isConnected}
                  .reset=${this.reset}
                  .factoryReset=${this.factoryReset}
                  .showToast=${this.showToast}
                ></system-tab>
              `
            : ""}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-view": SettingsComponent;
  }
}
