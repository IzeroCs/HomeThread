import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { NavPage } from "@shared/types/nav.type";

import "@shared/components/sidebar/sidebar.style.scss";

const PRIMARY_ITEMS: { page: NavPage; label: string; icon: string }[] = [
  { page: "status", label: "Status", icon: "speed" },
  { page: "nodes", label: "Nodes", icon: "account_tree" },
  { page: "topology", label: "Topology", icon: "hub" },
  { page: "settings", label: "Settings", icon: "settings" },
];

const SETTINGS_ITEMS: { page: NavPage; label: string; icon: string }[] = [
  { page: "settings-br", label: "BR Connection", icon: "lan" },
  { page: "settings-openthread", label: "OpenThread", icon: "device_hub" },
  { page: "settings-system", label: "System", icon: "warning" },
];

@customElement("sidebar-nav")
export class SidebarComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) logoOnly = false;
  @property({ type: Boolean }) brConnected = false;
  @property({ type: String }) threadState: string | null = null;
  @property({ type: Boolean }) threadRunOnConnect = false;
  @property({ type: Number }) nodesCount: number | null = null;
  @property({ type: String }) currentPage: NavPage = "status";

  @state() private settingsOpen = false;

  private _isSettingsPage(): boolean {
    const p = this.currentPage;
    return p === "settings" || p === "settings-br" || p === "settings-openthread" || p === "settings-system";
  }

  private _statusClass(): string {
    if (!this.brConnected) return "status-disconnected";
    const s = this.threadState?.toLowerCase();
    if (s === "child") return "status-thread-blue";
    if (s === "router") return "status-thread-purple";
    if (s === "leader") return "status-thread-green";
    return "status-br";
  }

  private _statusTitle(): string {
    if (!this.brConnected) return "Chưa kết nối BR";
    if (this.threadState) return `BR đã kết nối, Thread: ${this.threadState}`;
    return this.threadRunOnConnect ? "BR đã kết nối, đang chạy Thread" : "BR đã kết nối";
  }

  private _handlePrimaryClick(page: NavPage) {
    if (page === "settings") {
      this.settingsOpen = !this.settingsOpen;
      if (!this._isSettingsPage()) {
        this._emitNavigate("settings-br");
      }
      return;
    }
    this._emitNavigate(page);
  }

  private _emitNavigate(page: NavPage) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: page, bubbles: true, composed: true }));
  }

  render() {
    const isSettingsPage = this._isSettingsPage();
    const statusClass = this._statusClass();
    const statusTitle = this._statusTitle();

    return html`
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-logo">
            <span class="material-symbols-outlined">hub</span>
          </div>
          <div class="sidebar-brand-row">
            <span class="sidebar-brand-text">OpenThread</span>
            ${!this.logoOnly
              ? html`<span
                  class="sidebar-status-dot ${statusClass}"
                  title="${statusTitle}"
                  aria-label="${statusTitle}"
                ></span>`
              : ""}
          </div>
        </div>
        ${!this.logoOnly
          ? html`
              <nav class="sidebar-nav">
                ${PRIMARY_ITEMS.map(
                  (item) => html`
                    <button
                      type="button"
                      class="sidebar-nav-item ${item.page === "settings" ? (isSettingsPage ? "active" : "") : this.currentPage === item.page ? "active" : ""}"
                      @click=${() => this._handlePrimaryClick(item.page)}
                      title="${item.page === "nodes" && this.nodesCount != null ? `${item.label} (${this.nodesCount})` : item.label}"
                    >
                      <span class="material-symbols-outlined">${item.icon}</span>
                      <span class="sidebar-nav-label">
                        ${item.label}
                        ${item.page === "nodes" && this.nodesCount != null ? ` (${this.nodesCount})` : ""}
                      </span>
                      ${item.page === "settings"
                        ? html`<span
                            class="material-symbols-outlined sidebar-expand-icon ${this.settingsOpen ? "sidebar-expand-icon--open" : ""}"
                          >
                            expand_more
                          </span>`
                        : ""}
                    </button>
                  `
                )}
                <div class="sidebar-section ${this.settingsOpen ? "sidebar-section--open" : "sidebar-section--closed"}">
                  <div class="sidebar-section-items">
                    ${SETTINGS_ITEMS.map(
                      (item) => html`
                        <button
                          type="button"
                          class="sidebar-nav-item sidebar-nav-item--nested ${this.currentPage === item.page ? "active" : ""}"
                          @click=${() => this._emitNavigate(item.page)}
                          title="${item.label}"
                        >
                          <span class="material-symbols-outlined sidebar-nav-nested-icon">${item.icon}</span>
                          <span class="sidebar-nav-label">${item.label}</span>
                        </button>
                      `
                    )}
                  </div>
                </div>
              </nav>
              <div class="sidebar-footer"></div>
            `
          : ""}
      </aside>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sidebar-nav": SidebarComponent;
  }
}
