import { NmxStoreElement } from "@namorix/core/components"
import type { LitStoreController } from "@namorix/core/store"
import { store, type RootState } from "@/store/store"

type EqualityFn<T> = (a: T, b: T) => boolean

/**
 * App-level base element:
 * - Light DOM (inherited from NmxBaseElement)
 * - Auto inject fonts (inherited from NmxBaseElement; do not change)
 * - Redux subscription helpers for app store
 * - Optional locale subscription to re-render on language change
 */
export abstract class AppBaseElement extends NmxStoreElement<RootState> {
  protected getStore() {
    return store
  }

  protected createStoreSlice<T>(
    selector: (state: RootState) => T,
    equals: EqualityFn<T> = Object.is,
  ): LitStoreController<RootState, T> {
    return super.createStoreSlice(selector, equals)
  }
}
