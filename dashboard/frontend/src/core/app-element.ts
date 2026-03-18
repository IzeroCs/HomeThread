import type { ReactiveControllerHost } from "lit";
import { LitElement } from "lit";
import { LitStoreController } from "@namorix/core/store";
import { store } from "@/store/store";
import type { RootState } from "@/store/store";
import { selectLocale } from "@/store/selectors";

type EqualityFn<T> = (a: T, b: T) => boolean;

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
    return new LitStoreController(this as unknown as ReactiveControllerHost,
      store, (s) => selectLocale(s), Object.is);
  }

  /** Call at start of render() so the component re-renders when locale changes. */
  protected useLocale(): void {
    if (this.locale) void this.locale.value;
  }

  /**
   * Create a store slice controller. Use in field initializer, e.g.:
   * private readonly items = this.createStoreSlice(selectItems, shallowEqual);
   */
  protected createStoreSlice<T>(
    selector: (state: RootState) => T,
    equals: EqualityFn<T> = Object.is
  ): LitStoreController<RootState, T> {
    return new LitStoreController(
      this as unknown as ReactiveControllerHost,
      store,
      selector,
      equals
    );
  }
}
