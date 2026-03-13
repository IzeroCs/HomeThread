import { LitElement, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import "@shared/components/page-header/page-header.style.scss";

@customElement("page-header")
export class PageHeaderComponent extends LitElement {
  @property({ type: String }) heading: string | null = null;
  @property({ type: String }) subtitle: string | null = null;
  @property({ attribute: false }) content: TemplateResult | null = null;
  @property({ attribute: false }) action: TemplateResult | null = null;

  override createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <header class="page-header">
        <div class="page-header-heading">
          <h1 class="page-header-heading-title">${this.heading}</h1>
          ${this.subtitle ? html`<p class="page-header-heading-subtitle">${this.subtitle}</p>` : ""}
        </div>
        <div class="page-header-content">
          ${this.content ? html`${this.content}` : ""}
        </div>
        ${this.action ? html`<div class="page-header-action">${this.action}</div>` : ""}
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-header": PageHeaderComponent;
  }
}
