/**
 * Parse USB CDC frame (RX) - ESP32 → Node
 * Buffer tích lũy, tìm SOF, đọc LEN (big-endian), DATA, CRC8, EOF, validate CRC.
 */

import { SOF, EOF, MAX_DATA_LEN } from "./frame.constants";
import { crc8Maxim } from "./frame.crc8";

export interface ParsedFrame {
  frameId: number;
  cmd: number;
  data: Buffer;
}

const MIN_FRAME_LEN = 1 + 1 + 1 + 2 + 0 + 1 + 1; // SOF + ID + CMD + LEN + CRC + EOF = 7

/**
 * Parser tích lũy bytes, emit frame khi đủ và hợp lệ.
 */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Đẩy chunk nhận từ serial vào buffer, parse và gọi onFrame cho mỗi frame hoàn chỉnh.
   * Khi loại bỏ bytes (không SOF, LEN/EOF/CRC sai) gọi onDiscard(bytes, reason) để log [Transport].
   */
  push(
    chunk: Buffer,
    onFrame: (frame: ParsedFrame) => void,
    onDiscard?: (bytes: Buffer, reason: string) => void
  ): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= MIN_FRAME_LEN) {
      const sofIndex = this.buffer.indexOf(SOF);
      if (sofIndex < 0) {
        if (this.buffer.length > 0 && onDiscard) {
          onDiscard(this.buffer, "no SOF");
        }
        this.buffer = Buffer.alloc(0);
        break;
      }
      if (sofIndex > 0) {
        if (onDiscard) onDiscard(this.buffer.subarray(0, sofIndex), "no SOF");
        this.buffer = this.buffer.subarray(sofIndex);
      }
      // this.buffer[0] === SOF
      const lenHigh = this.buffer[1 + 1 + 1]; // after SOF, frameId, cmd
      const lenLow = this.buffer[1 + 1 + 1 + 1];
      const dataLen = (lenHigh << 8) | lenLow;
      if (dataLen > MAX_DATA_LEN) {
        if (onDiscard) onDiscard(this.buffer.subarray(0, 1), "LEN > MAX");
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      const frameLen = 1 + 1 + 1 + 2 + dataLen + 1 + 1;
      if (this.buffer.length < frameLen) break;

      const frameBuf = this.buffer.subarray(0, frameLen);
      const eofByte = frameBuf[frameLen - 1];
      if (eofByte !== EOF) {
        if (onDiscard) onDiscard(this.buffer.subarray(0, 1), "bad EOF");
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const payload = frameBuf.subarray(1, 1 + 4 + dataLen);
      const crcReceived = frameBuf[frameLen - 2];
      const crcComputed = crc8Maxim(payload);
      if (crcComputed !== crcReceived) {
        if (onDiscard) onDiscard(this.buffer.subarray(0, frameLen), "bad CRC");
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const frameId = frameBuf[1];
      const cmd = frameBuf[2];
      const data = dataLen > 0 ? frameBuf.subarray(5, 5 + dataLen) : Buffer.alloc(0);

      onFrame({ frameId, cmd, data });
      this.buffer = this.buffer.subarray(frameLen);
    }

    if (this.buffer.length > 0 && this.buffer.indexOf(SOF) < 0) {
      if (onDiscard) onDiscard(this.buffer, "no SOF");
      this.buffer = Buffer.alloc(0);
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
