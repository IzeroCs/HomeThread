import { CSSResultGroup, LitElement, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { html } from "lit";

import "@namorix/core/styles/_tokens.scss";
import "@namorix/core/styles/_reset.scss";
import "@namorix/core/components/nmx-app-container";
import "./app";

import mainStyle from "./main.style.scss?inline";

@customElement("nmx-main")
export class NmxMain extends LitElement {
  static override styles: CSSResultGroup = [unsafeCSS(mainStyle)];

  render() {
    return html`
      <nmx-app-container
        .slotHtml=${html`<nmx-thread-app></nmx-thread-app>`}
      ></nmx-app-container>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-main": NmxMain;
  }
}
