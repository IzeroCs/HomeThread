import { LitElement, html, render, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createLocaleController } from "@/core/store/locale-controller";
import { t } from "@/core/i18n/i18n";

import "@core/components/modal/modal.style.scss";
import "@/core/components/spinner/spinner.component";

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

  private readonly locale = createLocaleController(this);

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

  private _resolveLegacy(
    action: ModalAction,
    kind: "action" | "cancel" | "confirm",
  ): "primary" | "ghost" | "text" {
    if (action.variant) return action.variant;
    if (kind === "confirm") return "primary";
    if (kind === "cancel") return "ghost";
    return "text";
  }

  private _resolveStyle(
    action: ModalAction,
    kind: "action" | "cancel" | "confirm",
  ): "text" | "filled" | "outlined" {
    if (action.style) return action.style;

    if (action.variant) {
      const legacy = this._resolveLegacy(action, kind);
      return legacy === "primary" ? "filled" : "text";
    }

    return kind === "confirm" ? "filled" : "text";
  }

  private _resolveTone(
    action: ModalAction,
    kind: "action" | "cancel" | "confirm",
  ): "default" | "info" | "success" | "warning" | "danger" {
    if (action.tone) return action.tone;

    if (action.variant) {
      const legacy = this._resolveLegacy(action, kind);
      return legacy === "primary" ? "info" : "default";
    }

    if (kind === "confirm") return "info";
    if (kind === "cancel") return "danger";
    return "default";
  }

  private _renderActionIcon(action: ModalAction): TemplateResult | string | null {
    const isLoading = action.loading ?? false;
    if (isLoading) return html`<spin-loader size="14" thickness="2"></spin-loader>`;
    return action.icon ?? null;
  }

  private _renderActionIconSlot(icon: TemplateResult | string | null): TemplateResult {
    if (!icon) return html``;

    const iconEl =
      typeof icon === "string"
        ? html`<span class="material-symbols-outlined modal-action-icon--md" aria-hidden>${icon}</span>`
        : icon;

    return html`<span class="modal-action-icon">${iconEl}</span>`;
  }

  private _buildActionClassName(
    kind: "action" | "cancel" | "confirm",
    style: "text" | "filled" | "outlined",
    tone: "default" | "info" | "success" | "warning" | "danger",
    action: ModalAction,
  ): string {
    const isLoading = action.loading ?? false;

    return [
      "modal-action-btn",
      `modal-action-btn--${kind}`,
      `modal-btn--${style}`,
      `modal-tone--${tone}`,
      action.className,
      isLoading ? "is-loading" : undefined,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private _renderAction(kind: "action" | "cancel" | "confirm", action: ModalAction): TemplateResult {
    const isLoading = action.loading ?? false;
    const style = this._resolveStyle(action, kind);
    const tone = this._resolveTone(action, kind);
    const className = this._buildActionClassName(kind, style, tone, action);
    const icon = this._renderActionIcon(action);
    return html`
      <button
        type="button"
        class=${className}
        @click=${action.onClick}
        ?disabled=${action.disabled ?? false}
        aria-label=${action.ariaLabel ?? action.label}
        aria-busy=${isLoading}
      >
        ${this._renderActionIconSlot(icon)}
        <span class="modal-action-label">${action.label}</span>
      </button>
    `;
  }

  private _buildOverlay(): TemplateResult {
    void this.locale.value;
    const action = this.actionAction
      ? { label: this.actionAction.label ?? t("modal.actions.default"), ...this.actionAction }
      : undefined;
    const cancel = this.cancelAction
      ? { label: this.cancelAction.label ?? t("modal.actions.cancel"), ...this.cancelAction }
      : undefined;
    const confirm = this.confirmAction
      ? { label: this.confirmAction.label ?? t("modal.actions.confirm"), ...this.confirmAction }
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
              aria-label=${t("modal.closeAriaLabel")}
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
