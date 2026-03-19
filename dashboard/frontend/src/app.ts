import { AppElement } from "@/core/app-element";
import { html } from "lit";
import { customElement } from "lit/decorators.js";
import { NAV_ITEMS } from "./shared/constants/nav.constants";
import { t } from "./core/i18n/i18n";

import "@/app.style.scss";
import namorixLogo from "@namorix/assets/logo/namorix-logo-dark.svg?url";

@customElement("nmx-thread-app")
export class NmxThreadApp extends AppElement {

  // static override useLocale = false;

  // private static _wsBridgeStarted = false;

  // private readonly wsConnected = this.createStoreSlice((s) => selectWsConnected(s), Object.is);
  // private readonly appBar = this.createStoreSlice((s) => selectAppBar(s), Object.is);

  // @state() private page: NavPage = "settings-connection";

  // override connectedCallback(): void {
  //   super.connectedCallback();
  //   if (!NmxThreadApp._wsBridgeStarted) {
  //     NmxThreadApp._wsBridgeStarted = true;
  //     startWsBridge(store);
  //   }
  // }

  // private _handleNavigate(e: CustomEvent<NavPage>) {
  //   this.page = e.detail;
  // }

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
