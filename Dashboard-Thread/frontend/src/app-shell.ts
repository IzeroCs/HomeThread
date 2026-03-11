import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { NavPage } from "@shared/types/nav.type";
import type { Toast } from "@shared/types/toast.type";
import { WebSocketController } from "@shared/controllers/websocket.controller";
import "@shared/components/sidebar/sidebar.component";
import "@shared/components/toast-container/toast-container.component";
import "@shared/components/waiting-for-backend/waiting-for-backend.component";
import "@settings/components/br-connection-form/br-connection-form.component";
import "@status/status.component";
import "@nodes/nodes.component";
import "@features/topology/topology-map.component";
import "@/features/settings/settings.component";

import "@/app.style.scss";

type SettingsSection = "br" | "openthread" | "system";

@customElement("app-shell")
export class AppShell extends LitElement {

  override createRenderRoot() {
    return this;
  }

  private ws = new WebSocketController(this);

  @state() private page!: NavPage;
  @state() private toasts!: Toast[];

  constructor() {
    super();
    this.page = "topology";
    this.toasts = [];
  }

  private _showToast(type: Toast["type"], message: string, duration = 3000) {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, type, message, duration };
    this.toasts = [...this.toasts, newToast];
    if (duration > 0) {
      setTimeout(() => this._removeToast(id), duration);
    }
  }

  private _removeToast(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  private _handleNavigate(e: CustomEvent<NavPage>) {
    this.page = e.detail;
  }

  private _handleConfigSave(newConfig: { brHost: string; brPort: number; useMdns?: boolean }) {
    this.ws.saveConfig({
      brHost: newConfig.brHost,
      brPort: newConfig.brPort,
      useMdns: newConfig.useMdns,
    });
    this.page = "nodes";
  }

  get _nodesCount(): number {
    const r = this.ws.routerTable?.rows?.length ?? 0;
    const c = this.ws.childTable?.rows?.length ?? 0;
    return r + c;
  }

  get _isSettingsPage(): boolean {
    return (
      this.page === "settings" ||
      this.page === "settings-br" ||
      this.page === "settings-openthread" ||
      this.page === "settings-system"
    );
  }

  get _settingsSection(): SettingsSection {
    return this.page === "settings-openthread" ? "openthread" : this.page === "settings-system" ? "system" : "br";
  }

  render() {
    const wsConnected = this.ws.connected;
    const config = this.ws.config ?? null;

    if (!wsConnected) {
      return html`
        <div class="app-layout app-layout--waiting">
          <div class="app-container">
            <waiting-for-backend></waiting-for-backend>
          </div>
        </div>
      `;
    }

    if (!config) {
      return html`
        <div class="app-layout">
          <sidebar-nav logoOnly></sidebar-nav>
          <main class="app-main">
            <div class="app-container">
              <br-connection-form
                .initialConfig=${null}
                .onSave=${this._handleConfigSave}
                .onTestConnect=${this.ws.testBrConnect.bind(this.ws)}
                .showToast=${this._showToast.bind(this)}
              ></br-connection-form>
            </div>
          </main>
        </div>
      `;
    }

    return html`
      <div class="app-layout">
        <sidebar-nav
          .currentPage=${this.page}
          @navigate=${this._handleNavigate}
          .brConnected=${this.ws.brStatus?.isConnected ?? false}
          .threadState=${this.ws.threadState}
          .threadRunOnConnect=${this.ws.threadRunOnConnect}
          .nodesCount=${this._nodesCount}
        ></sidebar-nav>
        <toast-container .toasts=${this.toasts} .removeToast=${this._removeToast.bind(this)}></toast-container>
        <main class="app-main ${this.page === "topology" ? "app-main--topology" : ""}">
          ${this.page === "status"
            ? html`
                <div class="app-container">
                  <status-view
                    .brStatus=${this.ws.brStatus}
                    .otConfig=${this.ws.otConfig}
                    .brConfig=${config}
                    .systemInfo=${this.ws.systemInfo}
                    .testBrConnect=${this.ws.testBrConnect.bind(this.ws)}
                  ></status-view>
                </div>
              `
            : ""}
          ${this._isSettingsPage
            ? html`
                <div class="app-container">
                  <settings-view
                    .brConfig=${config}
                    .onSaveBrConfig=${this._handleConfigSave}
                    .onTestBrConnect=${this.ws.testBrConnect.bind(this.ws)}
                    .activeSection=${this._settingsSection}
                    .showToast=${this._showToast.bind(this)}
                    .isConnected=${this.ws.brStatus?.isConnected ?? false}
                    .otConfig=${this.ws.otConfig}
                    .threadRunOnConnect=${this.ws.threadRunOnConnect}
                    .getOtConfig=${this.ws.getOtConfig.bind(this.ws)}
                    .setOtConfig=${this.ws.setOtConfig.bind(this.ws)}
                    .startThread=${this.ws.startThread.bind(this.ws)}
                    .stopThread=${this.ws.stopThread.bind(this.ws)}
                    .getThreadRunOnConnect=${this.ws.getThreadRunOnConnect.bind(this.ws)}
                    .setThreadRunOnConnect=${this.ws.setThreadRunOnConnect.bind(this.ws)}
                    .reset=${this.ws.reset.bind(this.ws)}
                    .factoryReset=${this.ws.factoryReset.bind(this.ws)}
                  ></settings-view>
                </div>
              `
            : ""}
          ${this.page === "topology"
            ? html`
                <topology-map
                  class="app-topology"
                  .routerTable=${this.ws.routerTable}
                  .childTable=${this.ws.childTable}
                  .otConfig=${this.ws.otConfig}
                  .brStatus=${this.ws.brStatus}
                ></topology-map>
              `
            : ""}
          ${this.page === "nodes"
            ? html`
                <div class="app-container">
                  <nodes-view
                    .isConnected=${this.ws.brStatus?.isConnected ?? false}
                    .brConfig=${config}
                    .routerTable=${this.ws.routerTable}
                    .childTable=${this.ws.childTable}
                    .joinerTable=${this.ws.joinerTable}
                    .otConfig=${this.ws.otConfig}
                    .threadState=${this.ws.threadState}
                    .testBrConnect=${this.ws.testBrConnect.bind(this.ws)}
                    .getJoinerTable=${this.ws.getJoinerTable.bind(this.ws)}
                    .commissionerConnect=${this.ws.commissionerConnect.bind(this.ws)}
                    .showToast=${this._showToast.bind(this)}
                  ></nodes-view>
                </div>
              `
            : ""}
        </main>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
