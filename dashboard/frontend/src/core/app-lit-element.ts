import { LitElement } from "lit";
import type { ReactiveControllerHost } from "lit";
import { LitStoreController } from "@/core/store/lit-store-controller";
import { store } from "@/core/store/store";
import type { RootState } from "@/core/store/store";
import { selectLocale } from "@/core/store/selectors";

type EqualityFn<T> = (a: T, b: T) => boolean;

/**
 * Base element for app components: optional locale subscription,
 * createStoreSlice helper, and light DOM by default.
 * Set static override useLocale = false on subclasses that don't need i18n.
 */
export abstract class AppLitElement extends LitElement {
  static useLocale = true;

  protected readonly locale =
    (this.constructor as typeof AppLitElement).useLocale
      ? this._createLocaleController()
      : null;

  private _createLocaleController() {
    return new LitStoreController(this as ReactiveControllerHost,
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
      this as ReactiveControllerHost,
      store,
      selector,
      equals
    );
  }

  override createRenderRoot() {
    return this;
  }
}
