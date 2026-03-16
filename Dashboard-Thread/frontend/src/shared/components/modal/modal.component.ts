import { LitElement, html, render, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import "@shared/components/modal/modal.style.scss";
import "@shared/components/spinner/spinner.component";

type ModalAction = {
  label?: string;
  onClick: () => void;
  icon?: TemplateResult | string;
  /**
   * Semantic tone for button color. Prefer this over className.
   * - default/info: blue
   * - success: green
   * - warning: orange
   * - danger: red
   */
  tone?: "default" | "info" | "success" | "warning" | "danger";
  /**
   * Visual style for button surface.
   * - text: transparent
   * - filled: solid background
   * - outlined: border
   */
  style?: "text" | "filled" | "outlined";
  /**
   * Backwards-compat alias (deprecated): use `tone` + `style`.
   */
  variant?: "text" | "ghost" | "primary";
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
};

@customElement("modal-dialog")
export class ModalComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) open = false;
  @property({ type: String }) title = "";
  @property({ attribute: false }) subtitle: string | TemplateResult | undefined;
  @property({ attribute: false }) body: TemplateResult | undefined;
  @property({ attribute: false }) onClose: () => void = () => {};
  @property({ attribute: false }) actionAction: ModalAction | undefined;
  @property({ attribute: false }) cancelAction: ModalAction | undefined;
  @property({ attribute: false }) confirmAction: ModalAction | undefined;
  @property({ attribute: false }) shouldRender: boolean | (() => boolean) | undefined;

  private _portalNode: HTMLDivElement | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this._handleKeydown = this._handleKeydown.bind(this);
    this._portalNode = document.createElement("div");
    document.body.appendChild(this._portalNode);
  }

  override updated(_changed: Map<string, unknown>) {
    const ok =
      typeof this.shouldRender === "function"
        ? this.shouldRender()
        : (this.shouldRender ?? true);

    const isVisible = this.open && ok;

    if (this._portalNode) {
      render(isVisible ? this._buildOverlay() : html``, this._portalNode);
    }

    document.removeEventListener("keydown", this._handleKeydown);
    if (isVisible) {
      document.addEventListener("keydown", this._handleKeydown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  override disconnectedCallback() {
    document.removeEventListener("keydown", this._handleKeydown);
    document.body.style.overflow = "";
    if (this._portalNode) {
      render(html``, this._portalNode);
      this._portalNode.remove();
      this._portalNode = null;
    }
    super.disconnectedCallback();
  }

  private _handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (this.cancelAction) {
        this.cancelAction.onClick();
      } else {
        this.onClose();
      }
    }
  }

  private _renderAction(kind: "action" | "cancel" | "confirm", action: ModalAction): TemplateResult {
    const isLoading = action.loading ?? false;
    const classes = ["modal-action-btn", `modal-action-btn--${kind}`];
    const legacy =
      action.variant ??
      (kind === "confirm" ? "primary" : kind === "cancel" ? "ghost" : "text");
    const style =
      action.style ??
      (action.variant
        ? legacy === "primary"
          ? "filled"
          : "text"
        : kind === "confirm"
          ? "filled"
          : "text");
    const tone =
      action.tone ??
      (action.variant
        ? legacy === "primary"
          ? "info"
          : "default"
        : kind === "confirm"
          ? "info"
          : kind === "cancel"
            ? "danger"
            : "default");

    classes.push(`modal-btn--${style}`);
    classes.push(`modal-tone--${tone}`);
    if (action.className) classes.push(action.className);
    if (isLoading) classes.push("is-loading");
    const iconEl = isLoading
      ? html`<spin-loader size="14" thickness="2"></spin-loader>`
      : typeof action.icon === "string"
        ? html`<span class="material-symbols-outlined modal-action-icon--md" aria-hidden>${action.icon}</span>`
        : (action.icon ?? null);
    return html`
      <button
        type="button"
        class=${classes.join(" ")}
        @click=${action.onClick}
        ?disabled=${action.disabled ?? false}
        aria-label=${action.ariaLabel ?? action.label}
        aria-busy=${isLoading}
      >
        ${iconEl ? html`<span class="modal-action-icon">${iconEl}</span>` : ""}
        <span class="modal-action-label">${action.label}</span>
      </button>
    `;
  }

  private _buildOverlay(): TemplateResult {
    const action = this.actionAction
      ? { label: this.actionAction.label ?? "Action", ...this.actionAction }
      : undefined;
    const cancel = this.cancelAction
      ? { label: this.cancelAction.label ?? "Cancel", ...this.cancelAction }
      : undefined;
    const confirm = this.confirmAction
      ? { label: this.confirmAction.label ?? "Confirm", ...this.confirmAction }
      : undefined;
    const hasFooter = !!(action || cancel || confirm);
    return html`
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        @click=${() => (this.cancelAction ? this.cancelAction.onClick() : this.onClose())}
      >
        <div class="modal-box" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <div class="modal-header-text">
              <h2 id="modal-title" class="modal-title">${this.title}</h2>
              ${this.subtitle ? html`<p class="modal-subtitle">${this.subtitle}</p>` : ""}
            </div>
            <button
              type="button"
              class="modal-close"
              @click=${() => (this.cancelAction ? this.cancelAction.onClick() : this.onClose())}
              aria-label="Đóng"
            >
              ×
            </button>
          </div>
          <div class="modal-body">${this.body}</div>
          ${hasFooter
            ? html`
                <div class="modal-footer">
                  ${action ? this._renderAction("action", action) : ""}
                  ${cancel ? this._renderAction("cancel", cancel) : ""}
                  ${confirm ? this._renderAction("confirm", confirm) : ""}
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  override render() {
    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "modal-dialog": ModalComponent;
  }
}
