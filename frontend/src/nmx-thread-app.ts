import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { NAV_ITEMS } from "@/shared/constants/nav.constants";
import type { NavPage } from "./shared/types/nav.type";
import { AppBaseElement } from "@/core/app-base-element";
import { startWsBridge } from "@/core/ws/ws-bridge";
import { store } from "@/store/store";
import { selectWsConnected } from "@/store/selectors";
import { NmxPageBuilder } from "@namorix/core/components/layout";
import { ShellWindowEvent, type NmxCoreApi } from "@namorix/core/shell-api";
import { setLocale } from "@namorix/core/store";
import { normalizeLocale } from "@namorix/core/i18n";
import { t } from "@/core/i18n/i18n";

import namorixLogo from "@namorix/assets/logo/namorix-logo-symbol-light.svg?url";
import "@namorix/core/components/layout/nmx-sidebar";
import "@namorix/core/components/appbar/nmx-appbar";
import "@namorix/core/components/layout/nmx-content";
import "@namorix/core/components/waiting/nmx-waiting";

import "@/features/network/status.component";


@customElement("nmx-thread-app")
export class NmxThreadApp extends AppBaseElement {
  private static _wsBridgeStarted = false;

  private _unsubLocale: (() => void) | null = null;

  @state() private page: NavPage = "monitor-status";

  private readonly pages = new NmxPageBuilder<NavPage>()
    .add("monitor-status", () => html`<status-view></status-view>`)
    .build();

  private readonly wsConnected = this.createStoreSlice(
    (s) => selectWsConnected(s), Object.is);

  override connectedCallback(): void {
    super.connectedCallback();
    void this._startWsBridgeOnce();
    const onLocale = (locale: string) => {
      store.dispatch(setLocale(normalizeLocale(locale)));
    };
    const shellApi = window.nmxCore as NmxCoreApi | undefined;
    if (shellApi?.onLocaleChange) {
      this._unsubLocale = shellApi.onLocaleChange(onLocale);
    } else {
      window.addEventListener(ShellWindowEvent.LocaleChanged, this._onShellLocale as EventListener);
    }
  }

  override disconnectedCallback(): void {
    if (this._unsubLocale) {
      this._unsubLocale();
      this._unsubLocale = null;
    } else {
      window.removeEventListener(ShellWindowEvent.LocaleChanged, this._onShellLocale as EventListener);
    }
    super.disconnectedCallback();
  }

  private _onShellLocale = (e: Event) => {
    const ce = e as CustomEvent<{ locale?: string }>;
    const loc = ce.detail?.locale;
    if (typeof loc === "string" && loc.length > 0) {
      store.dispatch(setLocale(normalizeLocale(loc)));
    }
  };

  private _isInShell(): boolean {
    return Boolean(window.nmxCore && this.getAttribute("nmx-window-id"));
  }

  private async _startWsBridgeOnce(): Promise<void> {
    if (NmxThreadApp._wsBridgeStarted) return;
    NmxThreadApp._wsBridgeStarted = true;

    if (this._isInShell()) {
      try {
        const r = await fetch("/api/desktop-bridge-config", { credentials: "include" });
        if (r.ok) {
          const cfg = (await r.json()) as {
            pluginId?: string;
            registrationSecret?: string;
            socketPath?: string;
          };
          if (cfg.pluginId && cfg.registrationSecret) {
            startWsBridge(store, {
              url: window.location.origin,
              path: cfg.socketPath || "/namorix-plugin-ws",
              auth: { secret: cfg.registrationSecret },
              query: { pluginId: cfg.pluginId },
              transports: ["websocket", "polling"],
            });
            return;
          }
        }
      } catch {
        // Fall through to standalone mode.
      }
    }

    const base = this.getAttribute("data-plugin-base-url")?.trim();
    startWsBridge(store, base ? { url: base } : undefined);
  }

  private _handleNavigate = (e: CustomEvent<NavPage>) => {
    this.page = e.detail;
  };

  private _buildNavGroups() {
    return NAV_ITEMS.map((group) => ({
      label: t(group.label),
      items: group.items.map((item) => ({
        page: item.page,
        label: t(item.label),
        icon: item.icon,
      })),
    }));
  }

  render() {
    if (!this.wsConnected.value) {
      return html`<nmx-waiting
        heading=${t("waiting.title")}
        subtitle=${t("waiting.subtitle")}
        cardLabel=${t("waiting.card.label")}
        cardStatus=${t("waiting.card.status")}
        cardHint=${t("waiting.card.hint")}
        infoText=${t("waiting.info")}
      ></nmx-waiting>`;
    }

    const navGroups = this._buildNavGroups();

    return html`
      <div class="nmx-thread-app nmx-app-container-main">
        <nmx-sidebar
          brand=${t("sidebar.brand")}
          .logo=${namorixLogo}
          .navGroups=${navGroups}
          .currentPage=${this.page}
          @navigate=${this._handleNavigate}
        ></nmx-sidebar>
        <nmx-appbar></nmx-appbar>
        <nmx-content
          .currentPage=${this.page}
          .pages=${this.pages}
        ></nmx-content>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-thread-app": NmxThreadApp;
  }
}
