/**
 * Build USB CDC frame (TX) - Node → ESP32
 * Format: SOF | Frame ID | CMD | LEN_HIGH, LEN_LOW | DATA... | CRC8 | EOF
 * CRC8 over [Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]
 */

import { SOF, EOF, MAX_DATA_LEN } from "./frame.constants";
import { crc8Maxim } from "./frame.crc8";

export function buildFrame(frameId: number, cmd: number, data?: Buffer): Buffer {
  const dataLen = data?.length ?? 0;
  if (dataLen > MAX_DATA_LEN) {
    throw new Error(`Frame DATA length ${dataLen} exceeds max ${MAX_DATA_LEN}`);
  }
  const lenHigh = (dataLen >> 8) & 0xff;
  const lenLow = dataLen & 0xff;

  const payload = Buffer.allocUnsafe(4 + dataLen);
  payload[0] = frameId & 0xff;
  payload[1] = cmd & 0xff;
  payload[2] = lenHigh;
  payload[3] = lenLow;
  if (data && dataLen > 0) {
    data.copy(payload, 4);
  }

  const crc = crc8Maxim(payload);

  const frame = Buffer.allocUnsafe(1 + payload.length + 1 + 1);
  frame[0] = SOF;
  payload.copy(frame, 1);
  frame[1 + payload.length] = crc;
  frame[1 + payload.length + 1] = EOF;

  return frame;
}
