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
import "@monitor/status/status.component";
import "@monitor/nodes/nodes.component";
import "@monitor/joiner/joiner.component";
import "@monitor/topology/topology-map.component";
import "@settings/connection/connection.component";
import "@settings/thread/thread.component";
import "@settings/device/device.component";

import "@/app.style.scss";

@customElement("app-shell")
export class AppShell extends LitElement {
  private static _wsBridgeStarted = false;

  override createRenderRoot() {
    return this;
  }

  private readonly wsConnected = new LitStoreController(this, store,
    (s) => selectWsConnected(s), Object.is);

  @state() private page!: NavPage;
  @state() private toasts!: Toast[];

  constructor() {
    super();
    this.page = "settings-connection";
    this.toasts = [];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!AppShell._wsBridgeStarted) {
      AppShell._wsBridgeStarted = true;
      startWsBridge(store);
    }
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

  private _renderPage() {
    switch (this.page) {
      case "monitor-status":
        return html`<status-view></status-view>`;

      case "monitor-nodes":
        return html`
          <div class="app-container">
            <nodes-view></nodes-view>
          </div>
        `;

      case "monitor-joiner":
        return html`
          <div class="app-container">
            <joiner-view .showToast=${this._showToast.bind(this)}></joiner-view>
          </div>
        `;

      case "monitor-topology":
        return html`<topology-map class="app-topology"></topology-map>`;

      case "settings-connection":
        return html`
          <div class="app-container">
            <settings-connection-view .showToast=${this._showToast.bind(this)}></settings-connection-view>
          </div>
        `;

      case "settings-thread":
        return html`
          <div class="app-container">
            <settings-thread-view .showToast=${this._showToast.bind(this)}></settings-thread-view>
          </div>
        `;

      case "settings-device":
        return html`
          <div class="app-container">
            <settings-device-view .showToast=${this._showToast.bind(this)}></settings-device-view>
          </div>
        `;
    }
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

        <main class="app-main ${this.page === "monitor-topology" ? "app-main--topology" : ""}">
          ${this._renderPage()}
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
