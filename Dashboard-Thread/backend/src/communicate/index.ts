/**
 * Communicate - Giao tiếp BR qua TCP (frame protocol)
 */

export { TransportTcp, type TransportTcpConfig } from "./TransportTcp";
export { BrConnectionConfigService, type BrConnectionConfig } from "./BrConnectionConfigService";
export { CommunicateManager } from "./CommunicateManager";
export type { ConnectionStatus, OtConfig, ThreadState, TableData, OnBroadcast } from "./CommunicateManager";
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
