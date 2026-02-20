/**
 * CommandManager - Xử lý frame protocol (RX: PING, DATA, ACK, NACK; TX: PING, ACK, pull request).
 * Tách riêng khỏi CommunicateManager để quản lý logic lệnh và pending request/response.
 */

import { buildFrame, CMD, type ParsedFrame } from "./frame";
import { CMD_NAMES } from "./frame/constants";
import { serialLogger, frameLogger } from "../utils/logger";

const FRAME_RESPONSE_TIMEOUT_MS = 5000;

/** Phần config được cập nhật từ ACK data (channel, panid, networkName, ...). */
export type AckDataConfig = {
  channel?: number;
  panid?: string;
  networkName?: string;
  ipaddr?: string;
  datasetActive?: string;
};

export interface CommandManagerCallbacks {
  writeRaw(buffer: Buffer): Promise<void>;
  broadcast(event: string, data?: unknown): void;
  /** Gọi khi nhận ACK data để merge vào config và broadcast ot:config. */
  onAckDataToConfig(partial: AckDataConfig): void;
}

function isMostlyPrintable(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    if (b >= 0x20 && b < 0x7f) printable++;
    else if (b === 0x0a || b === 0x0d || b === 0x09) printable++;
  }
  return printable / buf.length >= 0.8;
}

export class CommandManager {
  private nextFrameId = 0;
  private pendingFrames = new Map<
    number,
    {
      resolve: (result: { ack: boolean; data?: Buffer; errorCode?: number }) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private callbacks: CommandManagerCallbacks) {}

  /**
   * Xử lý frame nhận từ leader (PING → trả ACK; DATA → broadcast; ACK/NACK → resolve pending).
   */
  handle(frame: ParsedFrame): void {
    this.logFrame(frame, "RX");

    if (frame.cmd === CMD.PING) {
      this.replyAckToPing(frame.frameId);
      return;
    }
    if (frame.cmd === CMD.DATA) {
      this.handleCmdData(frame);
      return;
    }
    if (frame.cmd === CMD.ACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        pending.resolve({ ack: true, data: frame.data.length > 0 ? frame.data : undefined });
      }
      this.applyAckDataToConfig(frame.data);
      return;
    }
    if (frame.cmd === CMD.NACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        const errorCode = frame.data.length > 0 ? frame.data[0]! : 0;
        pending.resolve({ ack: false, errorCode });
      }
    }
  }

  /** Trả ACK (cùng Frame ID) khi leader gửi PING. */
  replyAckToPing(frameId: number): void {
    try {
      const ackFrame = buildFrame(frameId, CMD.ACK, undefined);
      this.callbacks.writeRaw(ackFrame).catch((err) => serialLogger.warn(`Failed to send ACK to PING: ${err?.message ?? err}`));
      frameLogger.log(`TX (reply) frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x02 (ACK) len=0`);
    } catch (err) {
      serialLogger.warn(`Failed to build ACK for PING: ${err?.message ?? err}`);
    }
  }

  /** Gửi frame PING (dùng bởi ping interval). */
  sendPing(frameId: number): Buffer {
    return buildFrame(frameId, CMD.PING, undefined);
  }

  /** Gửi pull request (cmd + data), chờ ACK/NACK. */
  sendRequest(
    cmd: number,
    data?: Buffer
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return new Promise((resolve) => {
      const frameId = this.consumeNextFrameId();

      const timeoutId = setTimeout(() => {
        if (this.pendingFrames.delete(frameId)) {
          resolve({ ack: false, errorCode: 0x03 });
        }
      }, FRAME_RESPONSE_TIMEOUT_MS);

      this.pendingFrames.set(frameId, { resolve, timeoutId });

      try {
        const frame = buildFrame(frameId, cmd, data);
        const cmdName = CMD_NAMES[cmd] ?? `0x${cmd.toString(16)}`;
        const dataLen = data?.length ?? 0;
        frameLogger.log(
          `TX frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x${cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${dataLen}`
        );
        this.callbacks.writeRaw(frame).catch(() => {
          if (this.pendingFrames.delete(frameId)) {
            clearTimeout(timeoutId);
            resolve({ ack: false, errorCode: 0x03 });
          }
        });
      } catch {
        if (this.pendingFrames.delete(frameId)) {
          clearTimeout(timeoutId);
          resolve({ ack: false, errorCode: 0x01 });
        }
      }
    });
  }

  /** Lấy frameId tiếp theo và tăng nextFrameId. */
  consumeNextFrameId(): number {
    const id = this.nextFrameId;
    this.nextFrameId = (this.nextFrameId + 1) & 0xff;
    return id;
  }

  clearPending(): void {
    for (const [, { timeoutId }] of this.pendingFrames) {
      clearTimeout(timeoutId);
    }
    this.pendingFrames.clear();
  }

  private logFrame(frame: ParsedFrame, direction: "RX"): void {
    const cmdName = CMD_NAMES[frame.cmd] ?? `0x${frame.cmd.toString(16)}`;
    const dataPreview =
      frame.data.length === 0
        ? "(empty)"
        : frame.data.length <= 64 && isMostlyPrintable(frame.data)
          ? frame.data.toString("utf8").replace(/\0/g, "\\0")
          : frame.data.toString("hex");
    frameLogger.log(
      `${direction} frameId=0x${frame.frameId.toString(16).padStart(2, "0")} cmd=0x${frame.cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${frame.data.length} data=${dataPreview}`
    );
  }

  private handleCmdData(frame: ParsedFrame): void {
    if (frame.data.length === 0) return;
    this.callbacks.broadcast("serial:frame:data", { frameId: frame.frameId, dataHex: frame.data.toString("hex") });
  }

  private parseAckData(data: Buffer): AckDataConfig | null {
    if (data.length === 0) return null;
    if (data.length === 1 && data[0]! >= 11 && data[0]! <= 26) {
      return { channel: data[0]! };
    }
    if (data.length === 2) {
      return { panid: "0x" + data.readUInt16BE(0).toString(16).toUpperCase().padStart(4, "0") };
    }
    if (data.length >= 1 && data.length <= 16) {
      const networkName = data.toString("utf8").replace(/\0/g, "");
      return networkName ? { networkName } : null;
    }
    if (data.length === 16) {
      const ipaddr = Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":");
      return { ipaddr };
    }
    if (data.length > 0) {
      return { datasetActive: data.toString("hex") };
    }
    return null;
  }

  private applyAckDataToConfig(data: Buffer): void {
    const partial = this.parseAckData(data);
    if (partial) this.callbacks.onAckDataToConfig(partial);
  }
}
