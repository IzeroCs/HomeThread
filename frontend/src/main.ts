import { CSSResultGroup, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { html } from "lit";

import "@namorix/core/styles/_tokens.scss";
import "@namorix/core/styles/_reset.scss";
import "@namorix/core/components";
import { NmxBaseMain } from "@namorix/core";
import { store, type RootState } from "@/store/store";
import type { ToastType } from "@namorix/core";
import { t } from "./core/i18n/i18n";
import "./nmx-thread-app";

import appStyle from "./nmx-thread-app.style.scss?inline";

@customElement("nmx-thread-main")
export class NmxMain extends NmxBaseMain {
  static override styles: CSSResultGroup = [unsafeCSS(appStyle)];

  protected override resolveToastConfig() {
    return {
      store,
      selectToasts: (s: unknown) => (s as RootState).toast.toasts,
      getTitle: (type: ToastType) => t(`toast.title.${type}`),
    };
  }

  protected override resolveAppBarConfig() {
    return {
      store,
      selectAppBar: (s: unknown) => (s as RootState).appBar,
    };
  }

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
    "nmx-thread-main": NmxMain;
  }
}
