import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { store } from "@/core/store/store";
import { createLocaleController } from "@/core/store/locale-controller";
import { LitStoreController, shallowEqual } from "@/core/store/lit-store-controller";
import { selectBrStatus, selectConfig, selectOtConfig, selectSystemInfo } from "@/core/store/selectors";
import { appBarActions } from "@/core/store/slices/appbar.slice";
import { t } from "@/core/i18n/i18n";

import "@monitor/status/status.style.scss";

function formatPanId(panid: string | null | undefined): string {
  if (!panid) return "—";
  return panid.startsWith("0x") || panid.startsWith("0X") ? panid : `0x${panid}`;
}

@customElement("status-view")
export class StatusComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      brStatus: selectBrStatus(s),
      brConfig: selectConfig(s),
      otConfig: selectOtConfig(s),
      systemInfo: selectSystemInfo(s),
    }),
    shallowEqual
  );

  @state() private networkKeyVisible = false;
  private _lastAppBarSig = "";

  private get _isConnected(): boolean {
    return this.appState.value.brStatus?.isConnected ?? false;
  }

  private get _ipaddr(): string | null {
    return this.appState.value.otConfig?.ipaddr?.trim() || null;
  }

  render() {
    void this.locale.value;
    const appBar = {
      heading: t("status.header.title"),
      subtitle: t("status.header.subtitle"),
      actions: [],
    };
    const sig = JSON.stringify(appBar);
    if (sig !== this._lastAppBarSig) {
      this._lastAppBarSig = sig;
      store.dispatch(appBarActions.setAppBar(appBar));
    }
    const isConnected = this._isConnected;
    const ipaddr = this._ipaddr;
    const { brStatus, otConfig, systemInfo } = this.appState.value;

    return html`
      <div class="page-container">
        <div class="status-page">
          <section class="status-section status-section-br">
            <div class="status-card status-card-br">
              <div class="status-card-br-icon ${!isConnected ? "disconnected" : ""}">
                <span class="material-symbols-outlined">${isConnected ? "router" : "signal_disconnected"}</span>
              </div>
              <div class="status-card-br-content">
                <div class="status-card-br-heading">
                  <h2 class="status-card-br-title">${t("status.br.title")}</h2>
                  <span class="status-badge ${isConnected ? "connected" : ""}">
                    <span class="status-badge-dot ${isConnected ? "connected" : ""}"></span>
                    ${isConnected ? t("status.br.badge.connected") : t("status.br.badge.disconnected")}
                  </span>
                </div>
                <div class="status-card-br-fields">
                  <div class="status-field">
                    <span class="status-field-label">${t("status.br.hostAddress")}</span>
                    <span class="status-field-value status-field-value ${!isConnected ? "muted" : ""}">
                      ${brStatus?.host != null ? `${brStatus.host}:${brStatus.port ?? "—"}` : "—"}
                    </span>
                  </div>
                  <div class="status-field">
                    <span class="status-field-label">${t("status.br.uptime")}</span>
                    <span class="status-field-value ${!isConnected ? "muted" : ""}">—</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="status-section ${!isConnected ? "disconnected" : ""}">
            <div class="status-section-ot-header">
              <h2 class="status-section-ot-title">
                <span class="material-symbols-outlined">lan</span>
                ${t("status.ot.title")}
              </h2>
            </div>
            <div class="status-card status-card-ot">
              <div class="status-ot-grid">
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.networkName")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.networkName ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.ipAddress")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : ipaddr ?? "—"}</span>
                </div>
                <div class="status-field ${isConnected ? "status-field-with-action" : ""}">
                  <span class="status-field-label">${t("status.ot.networkKey")}</span>
                  <span class="status-field-value">
                    ${!isConnected ? "—" : this.networkKeyVisible ? (otConfig?.networkKey ?? "—") : "••••••••••••••••"}
                  </span>
                  ${isConnected ? html`
                    <button
                      type="button"
                      class="status-field-toggle"
                      @click=${() => (this.networkKeyVisible = !this.networkKeyVisible)}
                      aria-label=${this.networkKeyVisible ? t("common.actions.hide") : t("common.actions.show")}
                    >
                      <span class="material-symbols-outlined">${this.networkKeyVisible ? "visibility_off" : "visibility"}</span>
                    </button>
                  ` : ""}
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.panId")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : formatPanId(otConfig?.panid)}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.meshLocalPrefix")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.meshLocalPrefix ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.pskc")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.pskc ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.channel")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.channel ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.channelMask")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.channelMask ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.securityPolicy")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.securityPolicy ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.extendedPanId")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.extendedPanId ?? "—"}</span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.ot.activeTimestamp")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.activeTimestamp ?? "—"}</span>
                </div>
                <div class="status-field status-field-version">
                  <span class="status-field-label">${t("status.ot.threadVersion")}</span>
                  <span class="status-field-value">${!isConnected ? "—" : otConfig?.threadVersion ?? "—"}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="status-section">
            <div class="status-section-ot-header">
              <h2 class="status-section-ot-title">
                <span class="material-symbols-outlined">computer</span>
                ${t("status.system.title")}
              </h2>
            </div>
            <div class="status-card status-card-ot">
              <div class="status-ot-grid status-ot-grid-system">
                <div class="status-field">
                  <span class="status-field-label">${t("status.system.ipv4Backend")}</span>
                  <span class="status-field-value">
                    ${systemInfo?.ipv4?.length ? systemInfo.ipv4.join(", ") : "—"}
                  </span>
                </div>
                <div class="status-field">
                  <span class="status-field-label">${t("status.system.ipv6Backend")}</span>
                  <span class="status-field-value status-field-value-wrap">
                    ${systemInfo?.ipv6?.length ? systemInfo.ipv6.join(", ") : "—"}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  override disconnectedCallback(): void {
    store.dispatch(appBarActions.clearAppBar());
    super.disconnectedCallback();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "status-view": StatusComponent;
  }
}
