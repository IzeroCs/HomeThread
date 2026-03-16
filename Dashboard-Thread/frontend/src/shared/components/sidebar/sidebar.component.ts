import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NavPage } from "@shared/types/nav.type";

import "@shared/components/sidebar/sidebar.style.scss";

interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_ITEMS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { page: "status", label: "Status", icon: "speed" },
      { page: "nodes", label: "Nodes", icon: "account_tree" },
      { page: "joiner", label: "Joiner", icon: "group_add" },
      { page: "topology", label: "Topology", icon: "hub" },
    ],
  },
  {
    label: "Settings",
    items: [
      { page: "settings-br", label: "BR Connection", icon: "lan" },
      { page: "settings-openthread", label: "OpenThread", icon: "device_hub" },
      { page: "settings-system", label: "System", icon: "warning" },
    ],
  },
];

@customElement("sidebar-nav")
export class SidebarComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) brConnected = false;
  @property({ type: String }) threadState: string | null = null;
  @property({ type: Boolean }) threadRunOnConnect = false;
  @property({ type: Number }) nodesCount: number | null = null;
  @property({ type: String }) currentPage: NavPage = "status";

  private _statusClass(): string {
    if (!this.brConnected) return "status-role-disconnected";
    const s = this.threadState?.toLowerCase();
    if (s === "child") return "status-role-child";
    if (s === "router") return "status-role-router";
    if (s === "leader") return "status-role-leader";
    return "status-role-disabled";
  }

  private _statusTitle(): string {
    if (!this.brConnected) return "disconnected";
    if (this.threadState) return this.threadState;
    return "disabled";
  }

  private _handlePrimaryClick(page: NavPage) {
    this._emitNavigate(page);
  }

  private _emitNavigate(page: NavPage) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: page, bubbles: true, composed: true }));
  }

  render() {
    const statusClass = this._statusClass();
    const statusTitle = this._statusTitle();

    return html`<aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-logo">
            <span class="material-symbols-outlined">hub</span>
          </div>
          <span class="sidebar-brand-text">OpenThread</span>
        </div>
      </div>
      <div class="sidebar-status">
        <div class="sidebar-status-text ${statusClass}">${statusTitle}</div>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-nav-section">
          ${NAV_ITEMS.map(group => html`
            <div class="sidebar-nav-section-title">${group.label}</div>
            ${group.items.map(item => html`
              <button class="sidebar-nav-item ${item.page === this.currentPage ? "active" : ""}" @click=${() => this._handlePrimaryClick(item.page)}>
                <span class="material-symbols-outlined">${item.icon}</span>
                ${item.label}
              </button>
            `)}
          `)}
        </div>
      </nav>
      <div class="sidebar-footer">
      <div class="sidebar-user-box">
        <div class="sidebar-user-avatar">
          <span class="material-symbols-outlined">account_circle</span>
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-username">IzeroCs</div>
          <div class="sidebar-user-name">Nguyen Danh Nam</div>
        </div>
      </div>
      </div>
    </aside>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sidebar-nav": SidebarComponent;
  }
}
