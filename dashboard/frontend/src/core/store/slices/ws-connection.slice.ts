import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface WsConnectionState {
  connected: boolean;
  connectError: string | null;
}

const initialState: WsConnectionState = {
  connected: false,
  connectError: null,
};

const slice = createSlice({
  name: "wsConnection",
  initialState,
  reducers: {
    connected(state) {
      state.connected = true;
      state.connectError = null;
    },
    disconnected(state) {
      state.connected = false;
    },
    connectError(state, action: PayloadAction<string>) {
      state.connected = false;
      state.connectError = action.payload;
    },
  },
});

export const wsConnectionActions = slice.actions;
export const wsConnectionReducer = slice.reducer;

