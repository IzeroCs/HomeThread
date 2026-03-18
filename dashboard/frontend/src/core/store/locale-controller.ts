import type { ReactiveControllerHost } from "lit";
import { createLocaleController as createCoreLocaleController } from "@namorix/core/store";
import { store } from "@/core/store/store";

/**
 * Helper: tạo controller subscribe locale từ store, dùng chung cho mọi component cần i18n.
 */
export function createLocaleController(host: ReactiveControllerHost) {
  return createCoreLocaleController(host, store as any);
}
