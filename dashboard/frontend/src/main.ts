import { CSSResultGroup, LitElement, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { html } from "lit";

import "@namorix/core/styles/_tokens.scss";
import "@namorix/core/styles/_reset.scss";
import "@namorix/core/components/nmx-app-container";
import "@namorix/core/components/toast";
import { initToast } from "@namorix/core";
import { store } from "@/store/store";
import { t } from "./core/i18n/i18n";
import "./app";

import mainStyle from "./main.style.scss?inline";

initToast({
  store,
  selectToasts: (s) => s.toast.toasts,
  getTitle: (type) => t(`toast.title.${type}`),
});

@customElement("nmx-main")
export class NmxMain extends LitElement {
  static override styles: CSSResultGroup = [unsafeCSS(mainStyle)];

  render() {
    return html`
      <nmx-app-container
        .slotHtml=${html`<nmx-thread-app></nmx-thread-app>`}
      ></nmx-app-container>
      <nmx-toast></nmx-toast>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-main": NmxMain;
  }
}
