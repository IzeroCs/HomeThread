import { configureStore } from "@reduxjs/toolkit";
import { wsConnectionReducer } from "./slices/ws-connection.slice";
import { brReducer } from "./slices/br.slice";
import { configReducer } from "./slices/config.slice";
import { otReducer } from "./slices/ot.slice";
import { tablesReducer } from "./slices/tables.slice";
import { systemReducer } from "./slices/system.slice";

export const store = configureStore({
  reducer: {
    ws: wsConnectionReducer,
    br: brReducer,
    config: configReducer,
    ot: otReducer,
    tables: tablesReducer,
    system: systemReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

