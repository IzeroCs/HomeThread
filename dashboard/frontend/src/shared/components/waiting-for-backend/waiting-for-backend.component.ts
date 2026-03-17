import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { LitStoreController } from "@/shared/store/lit-store-controller";
import { store } from "@/shared/store/store";
import { selectLocale } from "@/shared/store/selectors";
import { t } from "@/shared/i18n/i18n";

import "@shared/components/waiting-for-backend/waiting-for-backend.style.scss";

@customElement("waiting-for-backend")
export class WaitingForBackendComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private readonly locale = new LitStoreController(
    this,
    store,
    (s) => selectLocale(s),
    Object.is
  );

  render() {
    void this.locale.value;
    return html`
      <div class="page-container">
        <div class="waiting-for-backend">
          <div class="waiting-for-backend__spinner-wrap">
            <div class="waiting-for-backend__spinner" aria-hidden></div>
            <span class="material-symbols-outlined waiting-for-backend__spinner-icon" aria-hidden>router</span>
          </div>
          <div class="waiting-for-backend__copy">
            <h1 class="waiting-for-backend__title">${t("waiting.title")}</h1>
            <p class="waiting-for-backend__subtitle">${t("waiting.subtitle")}</p>
          </div>
          <div class="waiting-for-backend__card">
            <div class="waiting-for-backend__card-inner">
              <div class="waiting-for-backend__card-header">
                <div>
                  <span class="waiting-for-backend__card-label">${t("waiting.card.label")}</span>
                  <p class="waiting-for-backend__card-status">${t("waiting.card.status")}</p>
                </div>
              </div>
              <div class="waiting-for-backend__progress-track">
                <div class="waiting-for-backend__progress-bar" aria-hidden></div>
              </div>
              <div class="waiting-for-backend__card-footer">
                <span class="material-symbols-outlined waiting-for-backend__card-icon" aria-hidden
                  >settings_input_antenna</span
                >
                <p class="waiting-for-backend__card-hint">${t("waiting.card.hint")}</p>
              </div>
            </div>
          </div>
          <div class="waiting-for-backend__info">
            <span class="material-symbols-outlined waiting-for-backend__info-icon" aria-hidden>info</span>
            <p class="waiting-for-backend__info-text">
              ${t("waiting.info")}
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "waiting-for-backend": WaitingForBackendComponent;
  }
}
