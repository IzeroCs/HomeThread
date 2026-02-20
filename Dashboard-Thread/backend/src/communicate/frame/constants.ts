/**
 * USB CDC Frame constants - theo docs/usb_cdc_frame_structure.md
 */

export const SOF = 0xaa;
export const EOF = 0x55;

export const CMD = {
  DATA: 0x01,
  ACK: 0x02,
  NACK: 0x03,
  RESET: 0x10,
  FACTORY: 0x11,
  STATE: 0x12,
  DATASET_ACTIVE: 0x13,
  IP_ADDR: 0x14,
} as const;

export type CmdCode = (typeof CMD)[keyof typeof CMD];

/** Tên CMD để log dễ đọc */
export const CMD_NAMES: Record<number, string> = {
  [CMD.DATA]: "DATA",
  [CMD.ACK]: "ACK",
  [CMD.NACK]: "NACK",
  [CMD.RESET]: "RESET",
  [CMD.FACTORY]: "FACTORY",
  [CMD.STATE]: "STATE",
  [CMD.DATASET_ACTIVE]: "DATASET_ACTIVE",
  [CMD.IP_ADDR]: "IP_ADDR",
};

/** Max DATA length (bytes) */
export const MAX_DATA_LEN = 2048;

/** CMD_NACK error codes */
export const NACK_CODE = {
  RESERVED: 0x00,
  INVALID_CMD: 0x01,
  NOT_READY: 0x02,
  TIMEOUT: 0x03,
  INVALID_PARAM: 0x04,
  BUSY: 0x05,
} as const;

export const NACK_MESSAGE: Record<number, string> = {
  [NACK_CODE.RESERVED]: "Reserved",
  [NACK_CODE.INVALID_CMD]: "Invalid CMD",
  [NACK_CODE.NOT_READY]: "Not ready",
  [NACK_CODE.TIMEOUT]: "Timeout",
  [NACK_CODE.INVALID_PARAM]: "Invalid param",
  [NACK_CODE.BUSY]: "Busy",
};
