/**
 * USB CDC Frame constants - theo Documents/protocol/usb_cdc_frame_structure.md
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
  IP_ADDR: 0x13,
  DATASET_ACTIVE: 0x14,

  // Set config commands (bắt đầu từ 0x20)
  SET_PANID: 0x20,
  SET_CHANNEL: 0x21,
  SET_NETWORK_NAME: 0x22,
  SET_EXTENDED_PANID: 0x23,
  SET_NETWORK_KEY: 0x24,

  // Table commands (bắt đầu từ 0x30)
  ROUTER_TABLE: 0x30,
  CHILD_TABLE: 0x31,
  JOINER_TABLE: 0x32,

  // Thread start/stop
  THREAD_START: 0x40,
  THREAD_STOP: 0x41,
  THREAD_VERSION: 0x42,
  COMMISSIONER_JOINER: 0x43
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
  [CMD.SET_PANID]: "SET_PANID",
  [CMD.SET_CHANNEL]: "SET_CHANNEL",
  [CMD.SET_NETWORK_NAME]: "SET_NETWORK_NAME",
  [CMD.SET_EXTENDED_PANID]: "SET_EXTENDED_PANID",
  [CMD.SET_NETWORK_KEY]: "SET_NETWORK_KEY",
  [CMD.ROUTER_TABLE]: "ROUTER_TABLE",
  [CMD.CHILD_TABLE]: "CHILD_TABLE",
  [CMD.JOINER_TABLE]: "JOINER_TABLE",
  [CMD.THREAD_START]: "THREAD_START",
  [CMD.THREAD_STOP]: "THREAD_STOP",
  [CMD.THREAD_VERSION]: "THREAD_VERSION",
  [CMD.COMMISSIONER_JOINER]: "COMMISSIONER_JOINER",
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
