import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ToastType } from "@/core/types/toast.type";
import { createLocaleController } from "@/core/store/locale-controller";
import { LitStoreController, shallowEqual } from "@/core/store/lit-store-controller";
import { store } from "@/core/store/store";
import { selectToasts } from "@/core/store/selectors";
import { toastActions } from "@/core/store/slices/toast.slice";
import { t } from "@/core/i18n/i18n";

import "@core/components/toast/toast.style.scss";

function toastTitleKey(type: ToastType): string {
  switch (type) {
    case "success":
      return "toast.title.success";
    case "error":
      return "toast.title.error";
    case "warning":
      return "toast.title.warning";
    case "info":
      return "toast.title.info";
  }
}

@customElement("toast-view")
export class ToastViewComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = createLocaleController(this);

  private readonly toastsController = new LitStoreController(
    this,
    store,
    (s) => selectToasts(s),
    shallowEqual
  );

  @state() private exitingIds = new Set<string>();

  private handleRemove(id: string) {
    this.exitingIds = new Set(this.exitingIds).add(id);
    setTimeout(() => {
      store.dispatch(toastActions.removeToast(id));
      this.exitingIds = new Set(this.exitingIds);
      this.exitingIds.delete(id);
      this.exitingIds = new Set(this.exitingIds);
    }, 300);
  }

  render() {
    void this.locale.value;
    const toasts = this.toastsController.value;
    if (toasts.length === 0) return html``;
    return html`
      <div class="toast-list" aria-live="polite" aria-atomic="true">
        ${toasts.map(
          (toast) => html`
            <div
              class="toast toast--${toast.type} ${this.exitingIds.has(toast.id) ? "toast--exiting" : ""}"
              role="alert"
              @click=${() => this.handleRemove(toast.id)}
            >
              <div class="toast-bar" aria-hidden></div>
              <div class="toast-body">
                <p class="toast-title">${t(toastTitleKey(toast.type))}</p>
                <p class="toast-message">${toast.message}</p>
                <button
                  class="toast-close"
                  aria-label=${t("toast.actions.closeAriaLabel")}
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
    "toast-view": ToastViewComponent;
  }
}
