import { configureStore } from "@reduxjs/toolkit";
import { wsConnectionReducer } from "./slices/ws-connection.slice";
import { brReducer } from "./slices/br.slice";
import { configReducer } from "./slices/config.slice";
import { otReducer } from "./slices/ot.slice";
import { tablesReducer } from "./slices/tables.slice";
import { systemReducer } from "./slices/system.slice";
import { i18nReducer } from "./slices/i18n.slice";

export const store = configureStore({
  reducer: {
    ws: wsConnectionReducer,
    br: brReducer,
    config: configReducer,
    ot: otReducer,
    tables: tablesReducer,
    system: systemReducer,
    i18n: i18nReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

