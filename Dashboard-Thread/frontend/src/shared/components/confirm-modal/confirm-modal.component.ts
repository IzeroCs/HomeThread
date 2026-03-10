import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@shared/components/modal/modal.component";

import "@shared/components/confirm-modal/confirm-modal.style.scss";

const COUNTDOWN_SECONDS = 5;

@customElement("confirm-modal")
export class ConfirmModalComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) open = false;
  @property({ type: String }) title = "";
  @property({ type: String }) message = "";
  @property({ type: String }) confirmLabel = "Xác nhận";
  @property({ type: String }) variant: "danger" | "warning" = "danger";
  @property({ type: Boolean }) loading = false;
  @property({ attribute: false }) onClose: () => void = () => {};
  @property({ attribute: false }) onConfirm: () => void = () => {};

  @state() private countdown = COUNTDOWN_SECONDS;

  private _intervalId: ReturnType<typeof setInterval> | null = null;

  override updated(changed: Map<string, unknown>) {
    if (changed.has("open")) {
      this.countdown = COUNTDOWN_SECONDS;
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
      if (this.open) {
        this._intervalId = setInterval(() => {
          this.countdown = Math.max(0, this.countdown - 1);
          if (this.countdown <= 0 && this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
          }
        }, 1000);
      }
    }
  }

  override disconnectedCallback() {
    if (this._intervalId) clearInterval(this._intervalId);
    super.disconnectedCallback();
  }

  private get _canConfirm(): boolean {
    return this.countdown === 0 && !this.loading;
  }

  render() {
    return html`
      <modal-dialog
        .open=${this.open}
        .title=${this.title}
        .body=${html`
          <div class="confirm-modal-content">
            <p class="confirm-modal-message">${this.message}</p>
            <div class="confirm-modal-actions">
              <button
                type="button"
                class="confirm-modal-btn cancel"
                @click=${this.onClose}
                ?disabled=${this.loading}
              >
                Huỷ
              </button>
              <button
                type="button"
                class="confirm-modal-btn confirm ${this.variant}"
                @click=${this.onConfirm}
                ?disabled=${!this._canConfirm}
              >
                ${this.loading ? "Đang xử lý…" : this.countdown > 0 ? `${this.confirmLabel} (${this.countdown}s)` : this.confirmLabel}
              </button>
            </div>
          </div>
        `}
        .onClose=${this.loading ? () => {} : this.onClose}
      ></modal-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "confirm-modal": ConfirmModalComponent;
  }
}
