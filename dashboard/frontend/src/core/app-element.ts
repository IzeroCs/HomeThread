import type { ReactiveControllerHost } from "lit";
import { LitElement } from "lit";
import { subscribeStoreSelector } from "@namorix/core/store";
import { selectLocale } from "@/store/selectors";
import { store } from "@/store/store";

/**
 * Base element for app components: optional locale subscription,
 * createStoreSlice helper, and light DOM by default.
 * Set static override useLocale = false on subclasses that don't need i18n.
 */
export abstract class AppElement extends LitElement {
  static useLocale = true;

  override createRenderRoot() {
    return this;
  }

  protected readonly locale =
    (this.constructor as typeof AppElement).useLocale
      ? this._createLocaleController()
      : null;

  private _createLocaleController() {
    return subscribeStoreSelector(this as unknown as ReactiveControllerHost,
      store, selectLocale, Object.is);
  }

  override willUpdate(_changed: Map<string, unknown>) {
    super.willUpdate(_changed);
    if (this.locale) void this.locale.value;
  }
}
