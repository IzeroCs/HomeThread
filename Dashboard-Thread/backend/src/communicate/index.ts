/**
 * Communicate - Giao tiếp phần cứng (Serial, frame protocol)
 */

export { SerialPortService, type SerialPortConfig } from "./SerialPort";
export { SerialConfigService, type SerialConfig } from "./SerialConfigService";
export { CommunicateManager } from "./CommunicateManager";
export type { SerialStatus, OtConfig, ThreadState, TableData, OnBroadcast } from "./CommunicateManager";
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
