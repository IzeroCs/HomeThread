/**
 * Communicate - Giao tiếp BR qua TCP (frame protocol)
 */

export { TransportTcp, type TransportTcpConfig } from "./transport/tcp.transport";
export { BrConnectionConfigService, type BrConnectionConfig } from "@settings/br-connection.service";
export { BrManager } from "./br/br";
export type { ConnectionStatus, OtConfig, ThreadState, TableData, OnBroadcast } from "./br/br";
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
