/**
 * Communicate - Giao tiếp BR qua TCP (frame protocol)
 */

export { TransportTcp, type TransportTcpConfig } from "./transport-tcp.transport";
export { BrConnectionConfigService, type BrConnectionConfig } from "@settings/br-connection-config.service";
export { CommunicateManager } from "./communicate.manager";
export type { ConnectionStatus, OtConfig, ThreadState, TableData, OnBroadcast } from "./communicate.manager";
export { EVENTS, type EventName } from "shared/src/events";
export {
  buildFrame,
  FrameParser,
  crc8Maxim,
  CMD,
  SOF,
  EOF,
  MAX_DATA_LEN,
  NACK_CODE,
  NACK_MESSAGE,
} from "./frame";
export type { ParsedFrame, CmdCode } from "./frame";
