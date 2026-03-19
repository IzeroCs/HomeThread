import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createLocaleController } from "@/core/i18n/locale-controller";
import { t } from "@/core/i18n/i18n";

import "@core/components/spinner/spinner.style.scss";

@customElement("spin-loader")
export class SpinnerComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  @property({ type: Number }) size = 16;
  @property({ type: Number }) thickness = 2;

  render() {
    void this.locale.value;
    return html`
      <span
        class="spin-loader"
        role="status"
        aria-label=${t("common.loading")}
        style="width:${this.size}px;height:${this.size}px;border-width:${this.thickness}px;"
      ></span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "spin-loader": SpinnerComponent;
  }
}
