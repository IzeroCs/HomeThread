/**
 * USB CDC Frame protocol - build & parse
 */

export { SOF, EOF, CMD, CMD_NAMES, MAX_DATA_LEN, NACK_CODE, NACK_MESSAGE } from "./constants";
export type { CmdCode } from "./constants";
export { crc8Maxim, crc8MaximSlice } from "./crc8";
export { buildFrame } from "./frameBuilder";
export { FrameParser } from "./frameParser";
export type { ParsedFrame } from "./frameParser";
