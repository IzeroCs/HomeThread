import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { NAV_ITEMS } from "./shared/constants/nav.constants";
import { t } from "./core/i18n/i18n";
import { AppBaseElement } from "@/core/app-base-element";
import { startWsBridge } from "@/core/ws/ws-bridge";
import { store } from "@/store/store";
import { showToast } from "@namorix/core";

import namorixLogo from "@namorix/assets/logo/namorix-logo-symbol-light.svg?url";
import "@namorix/core/components/layout/nmx-sidebar";

@customElement("nmx-thread-app")
export class NmxThreadApp extends AppBaseElement {
  private static _wsBridgeStarted = false;

  // private readonly wsConnected = this.createStoreSlice((s) => selectWsConnected(s), Object.is);
  // private readonly appBar = this.createStoreSlice((s) => selectAppBar(s), Object.is);

  @state() private page = "";

  override connectedCallback(): void {
    super.connectedCallback();
    if (!NmxThreadApp._wsBridgeStarted) {
      NmxThreadApp._wsBridgeStarted = true;
      startWsBridge(store);
    }
  }

  private _handleNavigate = (e: CustomEvent<string>) => {
    this.page = e.detail;

    if (e.detail === "monitor-topology") {
      showToast("error", "This feature is not available in the current version.");
    }
  };

  // private _renderPage() {
  //   switch (this.page) {
  //     case "monitor-status":
  //       return html`
  //         <div class="app-container">
  //           <status-view></status-view>
  //         </div>
  //       `;

  //     case "monitor-nodes":
  //       return html`
  //         <div class="app-container">
  //           <nodes-view></nodes-view>
  //         </div>
  //       `;

  //     case "monitor-joiner":
  //       return html`
  //         <div class="app-container">
  //           <joiner-view></joiner-view>
  //         </div>
  //       `;

  //     case "monitor-topology":
  //       return html`<topology-map class="app-topology"></topology-map>`;

  //     case "settings-connection":
  //       return html`
  //         <div class="app-container">
  //           <settings-connection-view></settings-connection-view>
  //         </div>
  //       `;

  //     case "settings-thread":
  //       return html`
  //         <div class="app-container">
  //           <settings-thread-view></settings-thread-view>
  //         </div>
  //       `;

  //     case "settings-device":
  //       return html`
  //         <div class="app-container">
  //           <settings-device-view></settings-device-view>
  //         </div>
  //       `;
  //   }
  // }

  private buildNavGroups() {
    return NAV_ITEMS.map((group) => ({
      label: t(group.label),
      items: group.items.map((item) => ({
        page: item.page,
        label: t(item.label),
        icon: item.icon,
      })),
    }));
  }

  render() {
    const navGroups = this.buildNavGroups();

    return html`
      <div class="nmx-thread-app">
        <nmx-sidebar
          brand="OpenThread"
          .logo=${namorixLogo}
          .navGroups=${navGroups}
          .currentPage=${this.page}
          @navigate=${this._handleNavigate}
        ></nmx-sidebar>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-thread-app": NmxThreadApp;
  }
}
