import type { ReactiveControllerHost } from "lit";
import { LitStoreController } from "@/core/store/lit-store-controller";
import { store } from "@/core/store/store";
import { selectLocale } from "@/core/store/selectors";

/**
 * Helper: tạo controller subscribe locale từ store, dùng chung cho mọi component cần i18n.
 */
export function createLocaleController(host: ReactiveControllerHost) {
  return new LitStoreController(host, store, (s) => selectLocale(s), Object.is);
}
