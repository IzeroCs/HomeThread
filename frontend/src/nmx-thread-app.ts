import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { NAV_ITEMS } from "@/shared/constants/nav.constants";
import type { NavPage } from "./shared/types/nav.type";
import { AppBaseElement } from "@/core/app-base-element";
import { startWsBridge } from "@/core/ws/ws-bridge";
import { store } from "@/store/store";
import { selectWsConnected } from "@/store/selectors";
import { NmxPageBuilder } from "@namorix/core/components";
import { ShellWindowEvent, type NmxCoreApi } from "@namorix/core/shell-api";
import { setLocale, wsConnectionActions } from "@namorix/core/store";
import { normalizeLocale } from "@namorix/core/i18n";
import { t } from "@/core/i18n/i18n";

import namorixLogo from "@namorix/assets/logo/namorix-logo-symbol-light.svg?url";
import "@namorix/core/components";

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

  private _resolveAddonWsUrl(): string {
    const rawBaseUrl = this.getAttribute("data-addon-base-url")?.trim() ?? "";
    if (!rawBaseUrl) return "";
    try {
      return new URL(rawBaseUrl, window.location.origin).origin;
    } catch {
      return "";
    }
  }

  private async _startWsBridgeOnce(): Promise<void> {
    if (NmxThreadApp._wsBridgeStarted) return;

    if (!this._isInShell()) {
      store.dispatch(wsConnectionActions.connectError("Desktop shell context is required"));
      return;
    }

    const addonWsUrl = this._resolveAddonWsUrl();
    if (!addonWsUrl) {
      store.dispatch(wsConnectionActions.connectError("Addon backend URL is unavailable"));
      return;
    }
    NmxThreadApp._wsBridgeStarted = true;
    startWsBridge(store, {
      url: addonWsUrl,
      transports: ["websocket", "polling"],
    });
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
    const wsConnected = this.wsConnected.value;
    const navGroups = this._buildNavGroups();
    const waitingSubtitle = t("waiting.subtitle");

    return html`
      <nmx-waiting
        .open=${!wsConnected}
        heading=${t("waiting.title")}
        subtitle=${waitingSubtitle}
        cardLabel=${t("waiting.card.label")}
        actionLabel=${t("common.actions.reload")}
      ></nmx-waiting>

      ${wsConnected
        ? html`
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
          `
        : html``}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nmx-thread-app": NmxThreadApp;
  }
}
