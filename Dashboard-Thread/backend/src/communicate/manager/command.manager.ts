/**
 * CommandManager - Xử lý frame protocol (RX: DATA, ACK, NACK; TX: STATE, ACK, pull request).
 * Tách riêng khỏi CommunicateManager để quản lý logic lệnh và pending request/response.
 */

import { buildFrame, CMD, type ParsedFrame } from "../frame";
import { CMD_NAMES } from "../frame/frame.constants";
import { transportLogger, frameLogger } from "@utils/logger.util";
import { DEVICE_ROLE } from "@thread/thread-role";
import { bytes16ToIPv6String, ipv6StringToBytes } from "@utils/ipv6.util";
import { parseDatasetActive, type ParsedDataset } from "../frame";
import { EVENTS, type EventName } from "shared/src/events";

const FRAME_RESPONSE_TIMEOUT_MS = 5000;

/** Phần config được cập nhật từ ACK data (ipaddr, datasetActive và các field parsed từ dataset). */
export type AckDataConfig = ParsedDataset & {
  // Additional fields (không có trong ParsedDataset)
  ipaddr?: string;
  leaderRloc16?: string;
  datasetActive?: string; // Hex string gốc (để giữ lại cho compatibility)
};

export interface CommandManagerCallbacks {
  writeRaw(buffer: Buffer): Promise<void>;
  broadcast(event: EventName, data?: unknown): void;
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
      resolve: (result: { ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();
  /** Track frameId của DATASET_ACTIVE commands để thu gọn log ACK. */
  private datasetActiveFrameIds = new Set<number>();
  /** Track frameId của IP_ADDR commands để thu gọn log ACK. */
  private ipAddrFrameIds = new Set<number>();

  constructor(private callbacks: CommandManagerCallbacks) {}

  /**
   * Xử lý frame nhận từ leader. Chỉ có DATA (broadcast) và ACK/NACK (resolve pending + merge config).
   * Log: hiển thị RX đầy đủ; riêng ACK dataset/IP có log tóm tắt (fields log riêng).
   */
  handle(frame: ParsedFrame): void {
    if (frame.cmd === CMD.ACK && this.datasetActiveFrameIds.has(frame.frameId)) {
      // Thu gọn log ACK của dataset active: chỉ log 1 dòng thay vì toàn bộ hex data
      const cmdName = CMD_NAMES[frame.cmd] ?? `0x${frame.cmd.toString(16)}`;
      frameLogger.log(
        `RX frameId=0x${frame.frameId.toString(16).padStart(2, "0")} cmd=0x${frame.cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${frame.data.length} [Dataset Active - fields logged separately]`
      );
    } else if (frame.cmd === CMD.ACK && this.ipAddrFrameIds.has(frame.frameId)) {
      // Thu gọn log ACK của IP_ADDR: chỉ log 1 dòng thay vì toàn bộ hex data
      const cmdName = CMD_NAMES[frame.cmd] ?? `0x${frame.cmd.toString(16)}`;
      frameLogger.log(
        `RX frameId=0x${frame.frameId.toString(16).padStart(2, "0")} cmd=0x${frame.cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${frame.data.length} [IP Address - logged separately]`
      );
    } else {
      this.logFrame(frame, "RX");
    }

    if (frame.cmd === CMD.DATA) {
      this.handleCmdData(frame);
      return;
    }
    if (frame.cmd === CMD.ACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        const isIpAddrAck =
          this.ipAddrFrameIds.has(frame.frameId) && frame.data.length === 16;
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        // Chỉ merge vào config khi ACK là của CMD_IP_ADDR hoặc CMD_DATASET_ACTIVE
        const isConfigAck =
          this.ipAddrFrameIds.has(frame.frameId) ||
          this.datasetActiveFrameIds.has(frame.frameId);
        // Xóa frameId khỏi tracking sets sau khi nhận ACK
        this.datasetActiveFrameIds.delete(frame.frameId);
        this.ipAddrFrameIds.delete(frame.frameId);
        pending.resolve({
          ack: true,
          data: frame.data.length > 0 ? frame.data : undefined,
          frameId: frame.frameId,
        });
        if (isConfigAck) {
          this.applyAckDataToConfig(frame.data);
        }
        // BR mong đợi dashboard gửi reply ACK để xác nhận đã nhận IP; gửi ngay để BR dừng retry.
        if (isIpAddrAck) {
          this.replyAck(frame.frameId);
        }
      }
      return;
    }
    if (frame.cmd === CMD.NACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        const errorCode = frame.data.length > 0 ? frame.data[0]! : 0;
        pending.resolve({ ack: false, errorCode, frameId: frame.frameId });
      }
    }
  }

  /** Gửi frame STATE (pull state). Có thể kèm data hoặc không. */
  sendState(frameId: number, data?: Buffer): Buffer {
    return buildFrame(frameId, CMD.STATE, data && data.length > 0 ? data : undefined);
  }

  /** Gửi request CMD_STATE (pull state), leader trả ACK với 1 byte role. Không merge 1-byte vào config. */
  fetchState(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.sendRequest(CMD.STATE, undefined);
  }

  /** Gửi request CMD_IP_ADDR; khi nhận ACK (16 byte) thì onAckDataToConfig sẽ được gọi (parse IPv6 → config). Result có frameId để caller reply lại leader. */
  fetchIpAddr(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.IP_ADDR);
  }

  /** Gửi request CMD_DATASET_ACTIVE; khi nhận ACK thì onAckDataToConfig sẽ được gọi (dataset active hex → config). */
  fetchDatasetActive(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.DATASET_ACTIVE);
  }

  /** Gửi request CMD_ROUTER_TABLE để lấy router table. */
  fetchRouterTable(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.ROUTER_TABLE);
  }

  /** Gửi request CMD_CHILD_TABLE để lấy child table. */
  fetchChildTable(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.CHILD_TABLE);
  }

  /** Gửi request CMD_JOINER_TABLE để lấy joiner table. */
  fetchJoinerTable(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.JOINER_TABLE);
  }

  /** Gửi CMD_SET_PANID với PAN ID (2 bytes uint16 big-endian). */
  setPanid(panid: string): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    // Parse PAN ID từ string (0x1234 hoặc 1234) thành uint16
    const panidStr = panid.trim();
    const panidNum = panidStr.startsWith("0x") || panidStr.startsWith("0X")
      ? parseInt(panidStr.slice(2), 16)
      : parseInt(panidStr, 16);
    if (Number.isNaN(panidNum) || panidNum < 0 || panidNum > 0xfffe) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    // 2 bytes uint16 big-endian
    const data = Buffer.allocUnsafe(2);
    data.writeUInt16BE(panidNum, 0);
    return this.sendRequest(CMD.SET_PANID, data);
  }

  /** Gửi CMD_SET_CHANNEL với Channel (1 byte uint8_t, OpenThread 2.4 GHz: 11–26). */
  setChannel(channel: number): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    if (!Number.isInteger(channel) || channel < 11 || channel > 26) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    const data = Buffer.allocUnsafe(1);
    data[0] = channel;
    return this.sendRequest(CMD.SET_CHANNEL, data);
  }

  /** Gửi CMD_SET_NETWORK_NAME với Network Name (1-16 bytes UTF-8 string). */
  setNetworkName(networkName: string): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    const name = networkName.trim();
    const nameBytes = Buffer.from(name, "utf8");
    if (nameBytes.length === 0 || nameBytes.length > 16) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    return this.sendRequest(CMD.SET_NETWORK_NAME, nameBytes);
  }

  /** Gửi CMD_SET_EXTENDED_PANID với Extended PAN ID (8 bytes, 64-bit hex). */
  setExtendedPanid(extendedPanId: string): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    // Parse Extended PAN ID từ string (0x1234567890abcdef hoặc 1234567890abcdef) thành 8 bytes
    const panidStr = extendedPanId.trim().replace(/^0x|^0X/, "");
    if (!/^[0-9a-fA-F]{16}$/.test(panidStr)) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    // 8 bytes (64-bit big-endian)
    const data = Buffer.from(panidStr, "hex");
    if (data.length !== 8) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    return this.sendRequest(CMD.SET_EXTENDED_PANID, data);
  }

  /** Gửi CMD_SET_NETWORK_KEY với Network Key (16 bytes, 128-bit hex). */
  setNetworkKey(networkKey: string): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    // Parse Network Key từ string (0x1234... hoặc 1234...) thành 16 bytes
    const keyStr = networkKey.trim().replace(/^0x|^0X/, "").replace(/[\s:-]/g, "");
    if (!/^[0-9a-fA-F]{32}$/.test(keyStr)) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    // 16 bytes (128-bit big-endian)
    const data = Buffer.from(keyStr, "hex");
    if (data.length !== 16) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    return this.sendRequest(CMD.SET_NETWORK_KEY, data);
  }

  /** Gửi CMD_RESET để reset thiết bị (không có data). */
  reset(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.RESET);
  }

  /** Gửi CMD_FACTORY để factory reset thiết bị (confirm byte 0xAA). */
  factoryReset(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    const data = Buffer.from([0xaa]);
    return this.sendRequest(CMD.FACTORY, data);
  }

  /** Gửi CMD_THREAD_START để khởi động Thread. */
  startThread(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.THREAD_START);
  }

  /** Gửi CMD_THREAD_STOP để dừng Thread. */
  stopThread(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.THREAD_STOP);
  }

  /** Gửi CMD_THREAD_VERSION (request), nhận ACK với payload version (string/bytes tùy firmware). */
  getThreadVersion(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return this.sendRequest(CMD.THREAD_VERSION);
  }

  /**
   * Gửi CMD_COMMISSIONER_JOINER để thêm joiner vào commissioner.
   * DATA format: EUI64(8) + PSKD_len(1) + PSKD(variable, 1–32 bytes) + Timeout(4, uint32 big-endian, giây).
   * eui64: hex string 16 ký tự (8 bytes); tất cả zero = wildcard.
   * pskd: ASCII string, 1–32 ký tự.
   * timeoutSeconds: uint32, đơn vị giây.
   */
  commissionerJoiner(
    eui64: string,
    pskd: string,
    timeoutSeconds: number
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    const eui64Str = eui64.trim().replace(/^0x|^0X/, "").replace(/[:\-\s]/g, "");
    if (!/^[0-9a-fA-F]{16}$/.test(eui64Str)) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    // PSKd: Thread spec yêu cầu 6–32 ký tự, chỉ uppercase alphanum trừ I, O, Q, Z
    const pskdUpper = pskd.toUpperCase();
    if (pskdUpper.length < 6 || pskdUpper.length > 32 || !/^[A-HJ-NPR-Y0-9]+$/.test(pskdUpper)) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    const pskdBytes = Buffer.from(pskdUpper, "ascii");
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 0xffffffff) {
      return Promise.resolve({ ack: false, errorCode: 0x04 }); // INVALID_PARAM
    }
    // Build: EUI64(8) + PSKD_len(1) + PSKD(variable) + Timeout(4)
    const data = Buffer.allocUnsafe(8 + 1 + pskdBytes.length + 4);
    Buffer.from(eui64Str, "hex").copy(data, 0);
    data[8] = pskdBytes.length;
    pskdBytes.copy(data, 9);
    data.writeUInt32BE(timeoutSeconds, 9 + pskdBytes.length);
    return this.sendRequest(CMD.COMMISSIONER_JOINER, data);
  }

  /**
   * Gửi CMD_SRP_REGISTER (0x44) để BR/Thread-Host đăng ký service _dashboard._udp lên SRP server.
   * DATA: hostname_len(1) + hostname(N UTF-8, label only) + backend_ipv6(16) + port(2 BE).
   * ACK rỗng → OK; NACK 1 byte: 0x04 payload sai, 0x02 OT chưa sẵn sàng, 0x03 lock timeout.
   */
  sendSrpRegister(
    hostname: string,
    backendIPv6: string,
    port: number
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    const label = hostname.trim();
    const hostnameBytes = Buffer.from(label, "utf8");
    if (label.length === 0 || hostnameBytes.length > 63) {
      return Promise.resolve({ ack: false, errorCode: 0x04 });
    }
    const ipv6Buf = ipv6StringToBytes(backendIPv6.trim());
    if (!ipv6Buf || ipv6Buf.length !== 16) {
      return Promise.resolve({ ack: false, errorCode: 0x04 });
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return Promise.resolve({ ack: false, errorCode: 0x04 });
    }
    const data = Buffer.allocUnsafe(1 + hostnameBytes.length + 16 + 2);
    data[0] = hostnameBytes.length;
    hostnameBytes.copy(data, 1);
    ipv6Buf.copy(data, 1 + hostnameBytes.length);
    data.writeUInt16BE(port, 1 + hostnameBytes.length + 16);
    return this.sendRequest(CMD.SRP_REGISTER, data);
  }

  /** Gửi ACK (cùng frameId) cho leader biết đã nhận dữ liệu (vd. sau khi nhận ACK IP addr). */
  replyAck(frameId: number): void {
    try {
      const ackFrame = buildFrame(frameId, CMD.ACK, undefined);
      this.callbacks
        .writeRaw(ackFrame)
        .catch((err) => transportLogger.warn(`Failed to send reply ACK: ${(err as Error)?.message ?? err}`));
      frameLogger.log(`TX (reply) frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x02 (ACK) len=0`);
    } catch (err) {
      transportLogger.warn(`Failed to build reply ACK: ${err}`);
    }
  }

  /** Gửi pull request (cmd + data), chờ ACK/NACK. ACK result có frameId (để reply lại leader nếu cần). */
  sendRequest(
    cmd: number,
    data?: Buffer
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number; frameId?: number }> {
    return new Promise((resolve) => {
      const frameId = this.consumeNextFrameId();

      const timeoutId = setTimeout(() => {
        if (this.pendingFrames.delete(frameId)) {
          this.datasetActiveFrameIds.delete(frameId);
          this.ipAddrFrameIds.delete(frameId);
          resolve({ ack: false, errorCode: 0x03 });
        }
      }, FRAME_RESPONSE_TIMEOUT_MS);

      this.pendingFrames.set(frameId, { resolve, timeoutId });

      // Track frameId của DATASET_ACTIVE command để thu gọn log
      if (cmd === CMD.DATASET_ACTIVE) {
        this.datasetActiveFrameIds.add(frameId);
      }
      // Track frameId của IP_ADDR command để thu gọn log
      if (cmd === CMD.IP_ADDR) {
        this.ipAddrFrameIds.add(frameId);
      }

      try {
        const frame = buildFrame(frameId, cmd, data);
        const cmdName = CMD_NAMES[cmd] ?? `0x${cmd.toString(16)}`;
        const dataLen = data?.length ?? 0;
        frameLogger.log(
          `TX frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x${cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${dataLen}`
        );
        this.callbacks.writeRaw(frame).catch(() => {
          if (this.pendingFrames.delete(frameId)) {
            this.datasetActiveFrameIds.delete(frameId);
            this.ipAddrFrameIds.delete(frameId);
            clearTimeout(timeoutId);
            resolve({ ack: false, errorCode: 0x03 });
          }
        });
      } catch {
        if (this.pendingFrames.delete(frameId)) {
          this.datasetActiveFrameIds.delete(frameId);
          this.ipAddrFrameIds.delete(frameId);
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
    this.datasetActiveFrameIds.clear();
    this.ipAddrFrameIds.clear();
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
    this.callbacks.broadcast(EVENTS.BR_FRAME_DATA, { frameId: frame.frameId, dataHex: frame.data.toString("hex") });
  }

  private parseAckData(data: Buffer): AckDataConfig | null {
    if (data.length === 0) return null;
    /** 1 byte = role (response cho fetchState), không merge vào OtConfig. */
    if (data.length === 1 && data[0]! >= DEVICE_ROLE.DISABLED && data[0]! <= DEVICE_ROLE.LEADER) return null;
    if (data.length === 16) {
      const ipaddr = bytes16ToIPv6String(data);
      if (ipaddr) {
        // Byte 14-15 của Leader RLOC IPv6 = RLOC16 của leader
        const rloc16 = ((data[14]! << 8) | data[15]!);
        const leaderRloc16 = `0x${rloc16.toString(16).padStart(4, "0")}`;
        frameLogger.log(`  IP Address: ${ipaddr}`);
        frameLogger.log(`  Leader RLOC16: ${leaderRloc16}`);
        return { ipaddr, leaderRloc16 };
      }
      return null;
    }
    // Dataset active: parse hex-encoded TLVs thành các field riêng lẻ
    // Chỉ lưu datasetActive (hex string TLV) vào OtConfigManager khi parse thành công
    if (data.length > 0) {
      const hexString = data.toString("hex");
      const parsed = parseDatasetActive(hexString);
      if (parsed) {
        // Log từng field của dataset active riêng biệt
        if (parsed.activeTimestamp != null) frameLogger.log(`  Active Timestamp: ${parsed.activeTimestamp}`);
        if (parsed.channel != null) frameLogger.log(`  Channel: ${parsed.channel}`);
        if (parsed.wakeUpChannel != null) frameLogger.log(`  Wake-up Channel: ${parsed.wakeUpChannel}`);
        if (parsed.channelMask) frameLogger.log(`  Channel Mask: ${parsed.channelMask}`);
        if (parsed.extendedPanId) frameLogger.log(`  Ext PAN ID: ${parsed.extendedPanId}`);
        if (parsed.meshLocalPrefix) frameLogger.log(`  Mesh Local Prefix: ${parsed.meshLocalPrefix}`);
        if (parsed.networkKey) frameLogger.log(`  Network Key: ${parsed.networkKey}`);
        if (parsed.networkName) frameLogger.log(`  Network Name: ${parsed.networkName}`);
        if (parsed.panid) frameLogger.log(`  PAN ID: 0x${parsed.panid}`);
        if (parsed.pskc) frameLogger.log(`  PSKc: ${parsed.pskc}`);
        if (parsed.securityPolicy) frameLogger.log(`  Security Policy: ${parsed.securityPolicy}`);
        // Trả về cả hex string TLV gốc (datasetActive) và các field đã parse để lưu vào OtConfigManager
        return {
          datasetActive: hexString, // Hex string TLV gốc - chỉ lưu khi parse thành công
          ...parsed,
        };
      }
      // Nếu parse không thành công, không lưu vào OtConfigManager
      frameLogger.log(`Dataset Active: parse failed, raw hex (${hexString.length / 2} bytes) - not saved`);
      return null; // Không lưu khi parse không thành công
    }
    return null;
  }

  private applyAckDataToConfig(data: Buffer): void {
    const partial = this.parseAckData(data);
    if (partial) this.callbacks.onAckDataToConfig(partial);
  }
}
