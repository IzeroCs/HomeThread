import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Toast, ToastType } from "@shared/types/toast.type";

import "@shared/components/toast-container/toast-container.style.scss";

const TOAST_TITLES: Record<ToastType, string> = {
  success: "Thành công",
  error: "Lỗi",
  warning: "Cảnh báo",
  info: "Trợ giúp",
};

@customElement("toast-container")
export class ToastContainerComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Array }) toasts: Toast[] = [];
  @property({ attribute: false }) removeToast: (id: string) => void = () => {};

  @state() private exitingIds = new Set<string>();

  private handleRemove(id: string) {
    this.exitingIds = new Set(this.exitingIds).add(id);
    setTimeout(() => {
      this.removeToast(id);
      this.exitingIds = new Set(this.exitingIds);
      this.exitingIds.delete(id);
      this.exitingIds = new Set(this.exitingIds);
    }, 300);
  }

  render() {
    if (this.toasts.length === 0) return html``;
    return html`
      <div class="toast-container" aria-live="polite" aria-atomic="true">
        ${this.toasts.map(
          (toast) => html`
            <div
              class="toast toast--${toast.type} ${this.exitingIds.has(toast.id) ? "toast--exiting" : ""}"
              role="alert"
              @click=${() => this.handleRemove(toast.id)}
            >
              <div class="toast-bar" aria-hidden></div>
              <div class="toast-body">
                <p class="toast-title">${TOAST_TITLES[toast.type]}</p>
                <p class="toast-message">${toast.message}</p>
                <button
                  class="toast-close"
                  aria-label="Đóng"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.handleRemove(toast.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "toast-container": ToastContainerComponent;
  }
}
