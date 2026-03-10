import { LitElement, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import "@shared/components/modal/modal.style.scss";

@customElement("modal-dialog")
export class ModalComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) open = false;
  @property({ type: String }) title = "";
  @property({ attribute: false }) body: TemplateResult | undefined;
  @property({ attribute: false }) onClose: () => void = () => {};

  override connectedCallback() {
    super.connectedCallback();
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("open")) {
      if (this.open) {
        document.addEventListener("keydown", this._handleKeydown);
        document.body.style.overflow = "hidden";
      } else {
        document.removeEventListener("keydown", this._handleKeydown);
        document.body.style.overflow = "";
      }
    }
  }

  override disconnectedCallback() {
    document.removeEventListener("keydown", this._handleKeydown);
    document.body.style.overflow = "";
    super.disconnectedCallback();
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") this.onClose();
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        @click=${this.onClose}
      >
        <div class="modal-box" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <h2 id="modal-title" class="modal-title">${this.title}</h2>
            <button type="button" class="modal-close" @click=${this.onClose} aria-label="Đóng">×</button>
          </div>
          <div class="modal-body">
            ${this.body}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "modal-dialog": ModalComponent;
  }
}
