/**
 * Shared validation functions - dùng chung cho cả backend và frontend
 */

import { SERIAL_CONFIG, OT_CONFIG, BR_CONNECTION } from "./constants";

/**
 * Validate serial port configuration
 * @returns Error message string if invalid, null if valid
 */
export function validateSerialConfig(data: {
  serialPort?: string;
  baudRate?: number;
}): string | null {
  if (data.serialPort !== undefined) {
    if (typeof data.serialPort !== "string" || !data.serialPort.trim()) {
      return "Serial port is required";
    }
  }
  if (data.baudRate !== undefined) {
    const n = Number(data.baudRate);
    if (
      !Number.isInteger(n) ||
      n < SERIAL_CONFIG.MIN_BAUD_RATE ||
      n > SERIAL_CONFIG.MAX_BAUD_RATE
    ) {
      return `Baud rate must be an integer between ${SERIAL_CONFIG.MIN_BAUD_RATE} and ${SERIAL_CONFIG.MAX_BAUD_RATE}`;
    }
  }
  return null;
}

/**
 * Validate BR connection config (host + port, TCP)
 * @returns Error message string if invalid, null if valid
 */
export function validateBrConnectionConfig(data: {
  brHost?: string;
  brPort?: number;
}): string | null {
  if (data.brHost !== undefined) {
    if (typeof data.brHost !== "string" || !data.brHost.trim()) {
      return "BR host is required";
    }
  }
  if (data.brPort !== undefined) {
    const n = Number(data.brPort);
    if (
      !Number.isInteger(n) ||
      n < BR_CONNECTION.MIN_PORT ||
      n > BR_CONNECTION.MAX_PORT
    ) {
      return `BR port must be an integer between ${BR_CONNECTION.MIN_PORT} and ${BR_CONNECTION.MAX_PORT}`;
    }
  }
  return null;
}

/**
 * Validate OpenThread set config (PAN ID, Channel, Network Name, Extended PAN ID, Network Key)
 * @returns Error message string if invalid, null if valid
 */
export function validateOtSetConfig(data: {
  panid?: string;
  channel?: number;
  networkName?: string;
  extendedPanId?: string;
  networkKey?: string;
}): string | null {
  if (data.panid != null && data.panid !== "") {
    const panid = data.panid.trim();
    if (
      !/^0x[0-9a-fA-F]{1,4}$/.test(panid) &&
      !/^[0-9a-fA-F]{1,4}$/.test(panid)
    ) {
      return "PAN ID không hợp lệ";
    }
    const num = panid.startsWith("0x")
      ? parseInt(panid.slice(2), 16)
      : parseInt(panid, 16);
    if (
      Number.isNaN(num) ||
      num < OT_CONFIG.MIN_PAN_ID ||
      num > OT_CONFIG.MAX_PAN_ID
    ) {
      return `PAN ID phải trong khoảng 0x${OT_CONFIG.MIN_PAN_ID.toString(16).toUpperCase()}-0x${OT_CONFIG.MAX_PAN_ID.toString(16).toUpperCase()}`;
    }
  }
  if (data.channel != null) {
    const ch = Number(data.channel);
    if (
      !Number.isInteger(ch) ||
      ch < OT_CONFIG.MIN_CHANNEL ||
      ch > OT_CONFIG.MAX_CHANNEL
    ) {
      return `Channel phải là số nguyên ${OT_CONFIG.MIN_CHANNEL}-${OT_CONFIG.MAX_CHANNEL}`;
    }
  }
  if (data.networkName != null && data.networkName !== "") {
    const name = data.networkName.trim();
    // Calculate UTF-8 byte length (works in both Node.js and browser)
    const byteLength =
      typeof Buffer !== "undefined"
        ? Buffer.byteLength(name, "utf8")
        : new TextEncoder().encode(name).length;
    if (byteLength > OT_CONFIG.MAX_NETWORK_NAME_BYTES) {
      return `Network Name tối đa ${OT_CONFIG.MAX_NETWORK_NAME_BYTES} byte (UTF-8)`;
    }
    if (/[\x00-\x1f\x7f]/.test(name)) {
      return "Network Name không được chứa ký tự điều khiển";
    }
  }
  if (data.extendedPanId != null && data.extendedPanId !== "") {
    const epanid = data.extendedPanId.trim().replace(/^0x|^0X/, "").replace(/[\s:-]/g, "");
    if (!/^[0-9a-fA-F]{16}$/.test(epanid)) {
      return "Extended PAN ID phải là 16 ký tự hex (8 bytes, ví dụ: 0x1234567890abcdef)";
    }
  }
  if (data.networkKey != null && data.networkKey !== "") {
    const key = data.networkKey.trim().replace(/^0x|^0X/, "").replace(/[\s:-]/g, "");
    if (!/^[0-9a-fA-F]{32}$/.test(key)) {
      return "Network Key phải là 32 ký tự hex (16 bytes, ví dụ: 0x1234567890abcdef1234567890abcdef)";
    }
  }
  return null;
}
