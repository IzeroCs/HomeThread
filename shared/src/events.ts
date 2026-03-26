/**
 * WebSocket event names constants - dùng chung cho cả backend và frontend.
 * Pattern nhất quán với frame/constants.ts (CMD, NACK_CODE).
 */

export const EVENTS = {
  // BR connection events
  BR_STATUS: "br:status",
  BR_DATA: "br:data",
  BR_CONNECTED: "br:connected",
  BR_FRAME_DATA: "br:frame:data",

  // Config events
  CONFIG_GET: "config:get",
  CONFIG_SAVE: "config:save",
  CONFIG_UPDATE: "config:update",
  CONFIG_CURRENT: "config:current",
  CONFIG_SAVED: "config:saved",
  CONFIG_ERROR: "config:error",
  CONFIG_UPDATED: "config:updated",
  
  // BR connection commands
  BR_CONNECT: "br:connect",
  BR_DISCONNECT: "br:disconnect",
  BR_TEST: "br:test",
  BR_TEST_RESULT: "br:test:result",
  BR_ERROR: "br:error",
  BR_DISCONNECTED: "br:disconnected",

  // OpenThread events
  OT_CONFIG: "ot:config",
  OT_GET_CONFIG: "ot:getConfig",
  OT_SET_CONFIG: "ot:setConfig",
  OT_SET_CONFIG_RESULT: "ot:setConfig:result",
  OT_THREAD_STATE: "ot:threadState",
  OT_GET_THREAD_STATE: "ot:getThreadState",
  OT_ROUTER_TABLE: "ot:routerTable",
  OT_GET_ROUTER_TABLE: "ot:getRouterTable",
  OT_CHILD_TABLE: "ot:childTable",
  OT_GET_CHILD_TABLE: "ot:getChildTable",
  OT_JOINER_TABLE: "commissioner:joinerTable",
  
  // OpenThread commands
  OT_START_THREAD: "ot:startThread",
  OT_STOP_THREAD: "ot:stopThread",
  OT_START_THREAD_RESULT: "ot:startThread:result",
  OT_STOP_THREAD_RESULT: "ot:stopThread:result",
  OT_SET_THREAD_RUNNING: "ot:setThreadRunning",
  OT_SET_THREAD_RUNNING_RESULT: "ot:setThreadRunning:result",
  OT_GET_THREAD_RUN_ON_CONNECT: "ot:getThreadRunOnConnect",
  OT_SET_THREAD_RUN_ON_CONNECT: "ot:setThreadRunOnConnect",
  OT_THREAD_RUN_ON_CONNECT: "ot:threadRunOnConnect",
  
  // Commissioner commands
  COMMISSIONER_CONNECT: "commissioner:connect",
  COMMISSIONER_CONNECT_RESULT: "commissioner:connect:result",
  COMMISSIONER_GET_JOINER_TABLE: "commissioner:getJoinerTable",

  // Device commands
  DEVICE_RESET: "device:reset",
  DEVICE_RESET_RESULT: "device:reset:result",
  DEVICE_FACTORY_RESET: "device:factoryReset",
  DEVICE_FACTORY_RESET_RESULT: "device:factoryReset:result",

  // SRP register (frame CMD 0x44): backend → BR
  SRP_REGISTER: "srp:register",
  SRP_REGISTER_RESULT: "srp:register:result",

  // Backend system info (IPv4/IPv6) for Status → System section
  SYSTEM_INFO: "system:info",

  // Addon control-plane lifecycle state from Desktop backend
  ADDON_CONTROL_STATE: "addon:controlState",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
