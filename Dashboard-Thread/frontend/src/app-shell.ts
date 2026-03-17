import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { NavPage } from "@shared/types/nav.type";
import type { Toast } from "@shared/types/toast.type";
import { store } from "@/shared/store/store";
import { selectWsConnected } from "@/shared/store/selectors";
import { startWsBridge } from "@/shared/ws/ws-bridge";
import { LitStoreController } from "@/shared/store/lit-store-controller";
import "@shared/components/sidebar/sidebar.component";
import "@shared/components/toast-container/toast-container.component";
import "@shared/components/waiting-for-backend/waiting-for-backend.component";
import "@status/status.component";
import "@nodes/nodes.component";
import "@joiner/joiner.component";
import "@topology/topology-map.component";
import "@settings/settings.component";

import "@/app.style.scss";

type SettingsSection = "br" | "openthread" | "system";

@customElement("app-shell")
export class AppShell extends LitElement {

  override createRenderRoot() {
    return this;
  }

  private readonly wsConnected = new LitStoreController(
    this,
    store,
    (s) => selectWsConnected(s),
    Object.is
  );

  @state() private page!: NavPage;
  @state() private toasts!: Toast[];

  constructor() {
    super();
    this.page = "joiner";
    this.toasts = [];
    startWsBridge(store);
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

  get _isSettingsPage(): boolean {
    return (
      this.page === "settings-br" ||
      this.page === "settings-openthread" ||
      this.page === "settings-system"
    );
  }

  get _settingsSection(): SettingsSection {
    return this.page === "settings-openthread" ? "openthread" : this.page === "settings-system" ? "system" : "br";
  }

  render() {
    const wsConnected = this.wsConnected.value;

    if (!wsConnected) {
      return html`
        <div class="app-layout app-layout--waiting">
          <waiting-for-backend></waiting-for-backend>
        </div>
      `;
    }

    return html`
      <div class="app-layout">
        <sidebar-nav
          .currentPage=${this.page}
          @navigate=${this._handleNavigate}
        ></sidebar-nav>
        <toast-container .toasts=${this.toasts} .removeToast=${this._removeToast.bind(this)}></toast-container>

        <main class="app-main ${this.page === "topology" ? "app-main--topology" : ""}">
          ${this.page === "status" ? html`<status-view></status-view>` : ""}

          ${this._isSettingsPage ? html`
            <div class="app-container">
              <settings-view
                .activeSection=${this._settingsSection}
                .showToast=${this._showToast.bind(this)}
              ></settings-view>
            </div>
          ` : ""}

          ${this.page === "topology" ? html`<topology-map class="app-topology"></topology-map>` : ""}

          ${this.page === "nodes"
            ? html`
                <div class="app-container">
                  <nodes-view></nodes-view>
                </div>
              `
            : ""}

          ${this.page === "joiner"
            ? html`
                <div class="app-container">
                  <joiner-view
                    .showToast=${this._showToast.bind(this)}
                  ></joiner-view>
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
