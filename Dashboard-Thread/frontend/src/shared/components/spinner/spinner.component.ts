import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import "@shared/components/spinner/spinner.style.scss";

@customElement("spin-loader")
export class SpinnerComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Number }) size = 16;
  @property({ type: Number }) thickness = 2;

  render() {
    return html`
      <span
        class="spin-loader"
        role="status"
        aria-label="Loading"
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
