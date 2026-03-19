import type { ReactiveControllerHost } from "lit"
import { LitStoreController } from "@namorix/core/store"
import { store, type RootState } from "@/store/store"
import { selectLocale } from "@/store/selectors"

/**
 * Helper: subscribe `locale` từ Redux store cho mọi component cần i18n.
 * Components thường gọi `void this.locale.value` trong `render()` để trigger re-render.
 */
export function createLocaleController(host: ReactiveControllerHost) {
  return new LitStoreController<RootState, ReturnType<typeof selectLocale>>(
    host,
    store,
    selectLocale,
    Object.is,
  )
}
