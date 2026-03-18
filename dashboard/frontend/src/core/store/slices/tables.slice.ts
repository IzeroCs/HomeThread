import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { OtTableData } from "@/core/types/websocket.type";

export interface TablesState {
  routerTable: OtTableData | null;
  childTable: OtTableData | null;
  joinerTable: OtTableData | null;
}

const initialState: TablesState = {
  routerTable: null,
  childTable: null,
  joinerTable: null,
};

const slice = createSlice({
  name: "tables",
  initialState,
  reducers: {
    routerTableReceived(state, action: PayloadAction<OtTableData>) {
      state.routerTable = action.payload;
    },
    childTableReceived(state, action: PayloadAction<OtTableData>) {
      state.childTable = action.payload;
    },
    joinerTableReceived(state, action: PayloadAction<OtTableData>) {
      state.joinerTable = action.payload;
    },
    clearBrData(state) {
      state.routerTable = null;
      state.childTable = null;
      state.joinerTable = null;
    },
  },
});

export const tablesActions = slice.actions;
export const tablesReducer = slice.reducer;
