import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

import "@shared/components/waiting-for-backend/waiting-for-backend.style.scss";

@customElement("waiting-for-backend")
export class WaitingForBackendComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div class="waiting-for-backend">
        <div class="waiting-for-backend__spinner-wrap">
          <div class="waiting-for-backend__spinner" aria-hidden></div>
          <span class="material-symbols-outlined waiting-for-backend__spinner-icon" aria-hidden>router</span>
        </div>
        <div class="waiting-for-backend__copy">
          <h1 class="waiting-for-backend__title">Waiting for backend...</h1>
          <p class="waiting-for-backend__subtitle">Start the backend or reconnecting.</p>
        </div>
        <div class="waiting-for-backend__card">
          <div class="waiting-for-backend__card-inner">
            <div class="waiting-for-backend__card-header">
              <div>
                <span class="waiting-for-backend__card-label">Connection Pipeline</span>
                <p class="waiting-for-backend__card-status">SYSTEM STATUS: RETRYING</p>
              </div>
            </div>
            <div class="waiting-for-backend__progress-track">
              <div class="waiting-for-backend__progress-bar" aria-hidden></div>
            </div>
            <div class="waiting-for-backend__card-footer">
              <span class="material-symbols-outlined waiting-for-backend__card-icon" aria-hidden
                >settings_input_antenna</span
              >
              <p class="waiting-for-backend__card-hint">Connecting to OpenThread network...</p>
            </div>
          </div>
        </div>
        <div class="waiting-for-backend__info">
          <span class="material-symbols-outlined waiting-for-backend__info-icon" aria-hidden>info</span>
          <p class="waiting-for-backend__info-text">
            Please check your local server settings if this persists.
          </p>
        </div>
        <div class="waiting-for-backend__bg" aria-hidden>
          <div class="waiting-for-backend__bg-orb waiting-for-backend__bg-orb--top"></div>
          <div class="waiting-for-backend__bg-orb waiting-for-backend__bg-orb--bottom"></div>
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
