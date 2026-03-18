import { AppLitElement } from "@/core/app-lit-element";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import "@core/components/appbar/appbar.style.scss";

export interface PageHeaderAction {
  id: string;
  /** Material symbol name */
  icon: string;
  /** Aria-label; when set, also shown as button text next to icon */
  label?: string;
  disabled?: boolean;
  /** Visual style: text | filled | outlined */
  style?: "text" | "filled" | "outlined";
  /** Semantic tone: default | info | success | warning | danger */
  tone?: "default" | "info" | "success" | "warning" | "danger";
}

@customElement("appbar-nav")
export class PageHeaderComponent extends AppLitElement {
  @property({ type: String }) heading: string | null = null;
  @property({ type: String }) subtitle: string | null = null;
  @property({ attribute: false }) content: TemplateResult | null = null;
  @property({ attribute: false }) actions: PageHeaderAction[] = [];

  private _emitActionClick(id: string) {
    this.dispatchEvent(
      new CustomEvent("action-click", {
        bubbles: true,
        composed: true,
        detail: { id },
      })
    );
  }

  render() {
    const hasActions = this.actions.length > 0;
    return html`
      <header class="page-header">
        <div class="page-header-heading">
          <h1 class="page-header-heading-title">${this.heading}</h1>
          ${this.subtitle ? html`<p class="page-header-heading-subtitle">${this.subtitle}</p>` : ""}
        </div>
        <div class="page-header-content">
          ${this.content ? html`${this.content}` : ""}
        </div>
        ${hasActions
          ? html`
              <div class="page-header-action">
                ${this.actions.map((action) => this._renderAction(action))}
              </div>
            `
          : ""}
      </header>
    `;
  }

  private _renderAction(action: PageHeaderAction) {
    const showText = Boolean(action.label?.trim());
    const style = action.style ?? "text";
    const tone = action.tone ?? "default";

    if (!showText && style === "text" && tone === "default") {
      return html`
        <button
          type="button"
          class="btn-icon"
          ?disabled=${action.disabled}
          aria-label=${action.label ?? action.id}
          @click=${() => this._emitActionClick(action.id)}
        >
          <span class="material-symbols-outlined" aria-hidden>${action.icon}</span>
        </button>
      `;
    }

    const classes = [
      "page-header-btn",
      `page-header-btn--${style}`,
      `page-header-tone--${tone}`,
    ];
    return html`
      <button
        type="button"
        class=${classes.join(" ")}
        ?disabled=${action.disabled}
        aria-label=${action.label ?? action.id}
        @click=${() => this._emitActionClick(action.id)}
      >
        <span class="material-symbols-outlined page-header-btn-icon" aria-hidden>${action.icon}</span>
        ${showText ? html`<span class="page-header-btn-label">${action.label}</span>` : ""}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "page-header": PageHeaderComponent;
  }
}
