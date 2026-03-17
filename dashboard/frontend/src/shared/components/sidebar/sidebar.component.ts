import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NavPage } from "@shared/types/nav.type";
import { store } from "@/shared/store/store";
import { LitStoreController, shallowEqual } from "@/shared/store/lit-store-controller";
import {
  selectBrStatus,
  selectChildTable,
  selectLocale,
  selectRouterTable,
  selectThreadRunOnConnect,
  selectThreadState,
} from "@/shared/store/selectors";
import { t } from "@/shared/i18n/i18n";

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
    label: "sidebar.group.monitor",
    items: [
      { page: "monitor-status", label: "sidebar.item.status", icon: "speed" },
      { page: "monitor-nodes", label: "sidebar.item.nodes", icon: "account_tree" },
      { page: "monitor-joiner", label: "sidebar.item.joiner", icon: "group_add" },
      { page: "monitor-topology", label: "sidebar.item.topology", icon: "hub" },
    ],
  },
  {
    label: "sidebar.group.settings",
    items: [
      { page: "settings-connection", label: "sidebar.item.settingsConnection", icon: "lan" },
      { page: "settings-thread", label: "sidebar.item.settingsThread", icon: "device_hub" },
      { page: "settings-device", label: "sidebar.item.settingsDevice", icon: "warning" },
    ],
  },
];

@customElement("sidebar-nav")
export class SidebarComponent extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: String }) currentPage: NavPage = "monitor-status";

  private readonly locale = new LitStoreController(
    this,
    store,
    (s) => selectLocale(s),
    Object.is
  );

  private readonly appState = new LitStoreController(
    this,
    store,
    (s) => ({
      brConnected: selectBrStatus(s)?.isConnected ?? false,
      threadState: selectThreadState(s),
      threadRunOnConnect: selectThreadRunOnConnect(s),
      nodesCount:
        (selectRouterTable(s)?.rows?.length ?? 0) + (selectChildTable(s)?.rows?.length ?? 0),
    }),
    shallowEqual
  );

  private _statusClass(): string {
    if (!this.appState.value.brConnected) return "status-role-disconnected";
    const s = this.appState.value.threadState?.toLowerCase();
    if (s === "child") return "status-role-child";
    if (s === "router") return "status-role-router";
    if (s === "leader") return "status-role-leader";
    return "status-role-disabled";
  }

  private _statusTitle(): string {
    if (!this.appState.value.brConnected) return t("common.state.disconnected");
    if (this.appState.value.threadState) return this.appState.value.threadState;
    return t("sidebar.status.disabled");
  }

  private _handlePrimaryClick(page: NavPage) {
    this._emitNavigate(page);
  }

  private _emitNavigate(page: NavPage) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: page, bubbles: true, composed: true }));
  }

  render() {
    void this.locale.value;
    const statusClass = this._statusClass();
    const statusTitle = this._statusTitle();

    return html`<aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-logo">
            <span class="material-symbols-outlined">hub</span>
          </div>
          <span class="sidebar-brand-text">${t("sidebar.brand")}</span>
        </div>
      </div>
      <div class="sidebar-status">
        <div class="sidebar-status-text ${statusClass}">${statusTitle}</div>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-nav-section">
          ${NAV_ITEMS.map(group => html`
            <div class="sidebar-nav-section-title">${t(group.label)}</div>
            ${group.items.map(item => html`
              <button class="sidebar-nav-item ${item.page === this.currentPage ? "active" : ""}" @click=${() => this._handlePrimaryClick(item.page)}>
                <span class="material-symbols-outlined">${item.icon}</span>
                ${t(item.label)}
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
          <div class="sidebar-user-username">${t("sidebar.user.username")}</div>
          <div class="sidebar-user-name">${t("sidebar.user.name")}</div>
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
