import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { html } from "lit";

import "@namorix/core/styles/_tokens.scss";
import "@namorix/core/styles/nmx-base.scss";
import "@namorix/core/components";
import "./app";

@customElement("nmx-main")
export class NmxMain extends LitElement {
  render() {
    return html`
      <nmx-app-container>
        <nmx-app-thread></nmx-app-thread>
      </nmx-app-container>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-main": NmxMain;
  }
}
