/**
 * WebSocket event names constants - dùng chung cho cả backend và frontend.
 * Pattern nhất quán với frame/constants.ts (CMD, NACK_CODE).
 */

export const EVENTS = {
  // Serial events
  SERIAL_STATUS: "serial:status",
  SERIAL_DATA: "serial:data",
  SERIAL_CONNECTED: "serial:connected",
  SERIAL_FRAME_DATA: "serial:frame:data",
  
  // Config events
  CONFIG_GET: "config:get",
  CONFIG_SAVE: "config:save",
  CONFIG_UPDATE: "config:update",
  CONFIG_CURRENT: "config:current",
  CONFIG_SAVED: "config:saved",
  CONFIG_ERROR: "config:error",
  CONFIG_UPDATED: "config:updated",
  
  // Serial commands
  SERIAL_CONNECT: "serial:connect",
  SERIAL_DISCONNECT: "serial:disconnect",
  SERIAL_TEST: "serial:test",
  SERIAL_TEST_RESULT: "serial:test:result",
  SERIAL_ERROR: "serial:error",
  SERIAL_DISCONNECTED: "serial:disconnected",
  
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

  // Child data (CoAP → backend → frontend; payload to frontend is subset only)
  CHILD_DATA: "child:data",

  // SRP register (frame CMD 0x44): backend → BR
  SRP_REGISTER: "srp:register",
  SRP_REGISTER_RESULT: "srp:register:result",

  // Backend system info (IPv4/IPv6) for Status → System section
  SYSTEM_INFO: "system:info",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
