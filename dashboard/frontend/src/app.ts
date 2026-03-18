import { AppLitElement } from "@/core/app-lit-element";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { NavPage } from "@/core/types/nav.type";
import { store } from "@/core/store/store";
import { selectAppBar, selectWsConnected } from "@/core/store/selectors";
import { startWsBridge } from "@/core/ws/ws-bridge";
import "@/core/components/sidebar/sidebar.component";
import "@/core/components/toast/toast.component";
import "@/core/components/waiting/waiting.component";
import "@/core/components/appbar/appbar";
import "@monitor/status/status.component";
import "@monitor/nodes/nodes.component";
import "@monitor/joiner/joiner.component";
import "@monitor/topology/topology-map.component";
import "@settings/connection/connection.component";
import "@settings/thread/thread.component";
import "@settings/device/device.component";

import "@/app.style.scss";

@customElement("app-layout")
export class AppLayout extends AppLitElement {
  static override useLocale = false;

  private static _wsBridgeStarted = false;

  private readonly wsConnected = this.createStoreSlice((s) => selectWsConnected(s), Object.is);
  private readonly appBar = this.createStoreSlice((s) => selectAppBar(s), Object.is);

  @state() private page: NavPage = "settings-connection";

  override connectedCallback(): void {
    super.connectedCallback();
    if (!AppLayout._wsBridgeStarted) {
      AppLayout._wsBridgeStarted = true;
      startWsBridge(store);
    }
  }

  private _handleNavigate(e: CustomEvent<NavPage>) {
    this.page = e.detail;
  }

  private _renderPage() {
    switch (this.page) {
      case "monitor-status":
        return html`
          <div class="app-container">
            <status-view></status-view>
          </div>
        `;

      case "monitor-nodes":
        return html`
          <div class="app-container">
            <nodes-view></nodes-view>
          </div>
        `;

      case "monitor-joiner":
        return html`
          <div class="app-container">
            <joiner-view></joiner-view>
          </div>
        `;

      case "monitor-topology":
        return html`<topology-map class="app-topology"></topology-map>`;

      case "settings-connection":
        return html`
          <div class="app-container">
            <settings-connection-view></settings-connection-view>
          </div>
        `;

      case "settings-thread":
        return html`
          <div class="app-container">
            <settings-thread-view></settings-thread-view>
          </div>
        `;

      case "settings-device":
        return html`
          <div class="app-container">
            <settings-device-view></settings-device-view>
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
        <toast-view></toast-view>

        <main class="app-main ${this.page === "monitor-topology" ? "app-main--topology" : ""}">
          ${this.appBar.value.visible
            ? html`
                <page-header
                  .heading=${this.appBar.value.heading}
                  .subtitle=${this.appBar.value.subtitle}
                  .actions=${this.appBar.value.actions}
                ></page-header>
              `
            : ""}
          ${this._renderPage()}
        </main>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-layout": AppLayout;
  }
}
