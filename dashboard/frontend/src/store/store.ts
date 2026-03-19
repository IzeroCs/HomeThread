import { createPluginStore, type BaseRootState } from "@namorix/core/store";
import { wsConnectionReducer, type WsConnectionState } from "./slices/ws-connection.slice";
import { brReducer, type BrState } from "./slices/br.slice";
import { configReducer, type ConfigState } from "./slices/config.slice";
import { otReducer, type OtState } from "./slices/ot.slice";
import { tablesReducer, type TablesState } from "./slices/tables.slice";
import { systemReducer, type SystemState } from "./slices/system.slice";
import { toastReducer, type ToastState } from "./slices/toast.slice";
import { appBarReducer, type AppBarState } from "./slices/appbar.slice";

export type RootState = BaseRootState & {
  ws: WsConnectionState;
  br: BrState;
  config: ConfigState;
  ot: OtState;
  tables: TablesState;
  system: SystemState;
  toast: ToastState;
  appBar: AppBarState;
};

export const store = createPluginStore<RootState>({
  reducer: {
    ws: wsConnectionReducer,
    br: brReducer,
    config: configReducer,
    ot: otReducer,
    tables: tablesReducer,
    system: systemReducer,
    toast: toastReducer,
    appBar: appBarReducer,
  } as any,
});

export type AppDispatch = typeof store.dispatch;

