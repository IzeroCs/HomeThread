import type { RootState } from "@/shared/store/store";

export const selectWsConnected = (s: RootState) => s.ws.connected;
export const selectWsConnectError = (s: RootState) => s.ws.connectError;

export const selectBrStatus = (s: RootState) => s.br.brStatus;
export const selectBrError = (s: RootState) => s.br.brError;

export const selectConfig = (s: RootState) => s.config.config;
export const selectConfigError = (s: RootState) => s.config.configError;

export const selectOtConfig = (s: RootState) => s.ot.otConfig;
export const selectThreadRunning = (s: RootState) => s.ot.threadRunning;
export const selectThreadState = (s: RootState) => s.ot.threadState;
export const selectThreadRunOnConnect = (s: RootState) => s.ot.threadRunOnConnect;

export const selectRouterTable = (s: RootState) => s.tables.routerTable;
export const selectChildTable = (s: RootState) => s.tables.childTable;
export const selectJoinerTable = (s: RootState) => s.tables.joinerTable;

export const selectSystemInfo = (s: RootState) => s.system.systemInfo;

