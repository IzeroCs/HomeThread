import { AppElement } from "@/core/app-element";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import "@/app.style.scss";

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

  render() {
    return html`
      <div class="nmx-thread-app">
        <nmx-sidebar
          brand="OpenThread"
          logo="https://namorix.com/logo.svg"
          navGroups=${[]}
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
