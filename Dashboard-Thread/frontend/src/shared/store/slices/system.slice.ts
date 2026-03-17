import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface SystemInfo {
  ipv4: string[];
  ipv6: string[];
}

export interface SystemState {
  systemInfo: SystemInfo | null;
}

const initialState: SystemState = {
  systemInfo: null,
};

const slice = createSlice({
  name: "system",
  initialState,
  reducers: {
    systemInfoReceived(state, action: PayloadAction<SystemInfo | null>) {
      state.systemInfo = action.payload ?? null;
    },
    clear(state) {
      state.systemInfo = null;
    },
  },
});

export const systemActions = slice.actions;
export const systemReducer = slice.reducer;

