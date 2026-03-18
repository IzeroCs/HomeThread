import type { ToastType } from "@/shared/types/toast.type";
import { store } from "@/store/store";
import { toastActions } from "@/store/slices/toast.slice";

/**
 * Hiển thị toast toàn cục (dispatch vào store). Component gọi showToast(...) thay vì nhận prop.
 */
export function showToast(type: ToastType, message: string, duration = 3000): void {
  const id = `toast-${Date.now()}-${Math.random()}`;
  store.dispatch(toastActions.addToast({ id, type, message, duration }));
  if (duration > 0) {
    setTimeout(() => store.dispatch(toastActions.removeToast(id)), duration);
  }
}
