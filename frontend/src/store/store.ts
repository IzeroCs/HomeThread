import {
  addonControlReducer,
  type AddonControlState,
  createAddonStore,
  type BaseRootState,
  wsConnectionReducer,
  type WsConnectionState,
  toastReducer,
  type ToastState,
  appBarReducer,
  type AppBarState,
} from "@namorix/core/store";
import { brReducer, type BrState } from "./slices/br.slice";
import { configReducer, type ConfigState } from "./slices/config.slice";
import { otReducer, type OtState } from "./slices/ot.slice";
import { tablesReducer, type TablesState } from "./slices/tables.slice";
import { systemReducer, type SystemState } from "./slices/system.slice";

export type RootState = BaseRootState & {
  ws: WsConnectionState;
  br: BrState;
  config: ConfigState;
  ot: OtState;
  tables: TablesState;
  system: SystemState;
  control: AddonControlState;
  toast: ToastState;
  appBar: AppBarState;
};

export const store = createAddonStore<RootState>({
  reducer: {
    ws: wsConnectionReducer,
    br: brReducer,
    config: configReducer,
    ot: otReducer,
    tables: tablesReducer,
    system: systemReducer,
    control: addonControlReducer,
    toast: toastReducer,
    appBar: appBarReducer,
  } as any,
});

export type AppDispatch = typeof store.dispatch;

