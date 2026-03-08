/**
 * OTBR - Giao tiếp OTBR qua REST API (OtbrManager, OtbrRestClient, config, tables).
 */

export { OtbrManager } from "./otbr.manager";
export type { ConnectionStatus, OtConfig, ThreadState, TableData, OnBroadcast } from "./otbr.manager";
export { EVENTS, type EventName } from "shared/src/events";
