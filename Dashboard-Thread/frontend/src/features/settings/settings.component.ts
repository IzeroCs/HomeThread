import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import "@settings/components/br-connection-form/br-connection-form.component";
import "@settings/components/openthread-config-form/openthread-config-form.component";
import "@settings/components/system-tab/system-tab.component";
import { store } from "@/shared/store/store";
import { LitStoreController, shallowEqual } from "@/shared/store/lit-store-controller";
import { selectBrStatus, selectConfig, selectOtConfig, selectThreadRunOnConnect } from "@/shared/store/selectors";
import { wsEmitConfigSave, wsEmitGetThreadRunOnConnect, wsEmitSetThreadRunOnConnect } from "@/shared/store/thunks/ws.emit";
import {
  wsFactoryResetDevice,
  wsGetOtConfig,
  wsResetDevice,
  wsSetOtConfig,
  wsStartThread,
  wsStopThread,
  wsTestBrConnect,
} from "@/shared/store/thunks/ws.thunks";

import "@settings/settings.style.scss";

export type SettingsSection = "br" | "openthread" | "system";

@customElement("settings-view")
export class SettingsComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: String }) activeSection: SettingsSection = "br";
  @property({ attribute: false }) showToast: (type: "success" | "error" | "warning" | "info", message: string) => void = () => {};

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      brConfig: selectConfig(s),
      isConnected: selectBrStatus(s)?.isConnected ?? false,
      otConfig: selectOtConfig(s),
      threadRunOnConnect: selectThreadRunOnConnect(s),
    }),
    shallowEqual
  );

  render() {
    const { brConfig, isConnected, otConfig, threadRunOnConnect } = this.appState.value;
    return html`
      <div class="settings-page">
        <div class="settings-tab-content">
          ${this.activeSection === "br"
            ? html`
                <br-connection-form
                  .initialConfig=${brConfig}
                  .onSave=${(cfg: { brHost: string; brPort: number; useMdns?: boolean }) => wsEmitConfigSave(cfg)}
                  .onTestConnect=${(cfg: { brHost: string; brPort: number }) =>
                    store.dispatch(wsTestBrConnect(cfg)).unwrap()}
                  .showToast=${this.showToast}
                ></br-connection-form>
              `
            : ""}
          ${this.activeSection === "openthread"
            ? html`
                <openthread-config-form
                  .isConnected=${isConnected}
                  .otConfig=${otConfig}
                  .threadRunOnConnect=${threadRunOnConnect}
                  .getOtConfig=${() => store.dispatch(wsGetOtConfig()).unwrap()}
                  .setOtConfig=${(data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) =>
                    store.dispatch(wsSetOtConfig(data)).unwrap()}
                  .startThread=${() => store.dispatch(wsStartThread()).unwrap()}
                  .stopThread=${() => store.dispatch(wsStopThread()).unwrap()}
                  .getThreadRunOnConnect=${() => wsEmitGetThreadRunOnConnect()}
                  .setThreadRunOnConnect=${(run: boolean) => wsEmitSetThreadRunOnConnect(run)}
                  .showToast=${this.showToast}
                ></openthread-config-form>
              `
            : ""}
          ${this.activeSection === "system"
            ? html`
                <system-tab
                  .isConnected=${isConnected}
                  .reset=${() => store.dispatch(wsResetDevice()).unwrap()}
                  .factoryReset=${() => store.dispatch(wsFactoryResetDevice()).unwrap()}
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
