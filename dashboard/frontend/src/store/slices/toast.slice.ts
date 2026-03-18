import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Toast, ToastType } from "@/shared/types/toast.type";

export interface ToastState {
  toasts: Toast[];
}

const initialState: ToastState = {
  toasts: [],
};

const slice = createSlice({
  name: "toast",
  initialState,
  reducers: {
    addToast(state, action: PayloadAction<Toast>) {
      state.toasts.push(action.payload);
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const toastActions = slice.actions;
export const toastReducer = slice.reducer;
