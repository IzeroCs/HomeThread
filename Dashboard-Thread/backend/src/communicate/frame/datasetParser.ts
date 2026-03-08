/**
 * Parse OpenThread Active Operational Dataset từ hex-encoded TLVs.
 * Dataset là chuỗi các TLV (Type-Length-Value) được encode dạng hex.
 * 
 * TLV format: Type (1 byte) + Length (1 byte) + Value (Length bytes)
 * 
 * Các TLV types theo OpenThread spec:
 * - 0x00: Channel (3 bytes: channel page (1 byte) + channel number (2 bytes))
 * - 0x01: PAN ID (2 bytes, uint16)
 * - 0x02: Extended PAN ID (8 bytes)
 * - 0x03: Network Name (string, max 16 bytes)
 * - 0x04: PSKc (16 bytes)
 * - 0x05: Network Key (16 bytes)
 * - 0x07: Mesh Local Prefix (8 bytes)
 * - 0x0C: Security Policy (2 bytes)
 * - 0x0E: Active Timestamp (8 bytes)
 * - 0x35: Channel Mask (variable length)
 */

export type ParsedDataset = {
  activeTimestamp?: string;
  channel?: number;
  wakeUpChannel?: number;
  channelMask?: string;
  extendedPanId?: string;
  meshLocalPrefix?: string;
  networkKey?: string;
  networkName?: string;
  panid?: string;
  pskc?: string;
  securityPolicy?: string;
};

/**
 * Parse hex-encoded dataset active thành các field riêng lẻ.
 * @param hexString Hex string của dataset active (ví dụ: "0e080000000000010000000300001035...")
 * @returns ParsedDataset với các field đã parse được, hoặc null nếu parse lỗi
 */
export function parseDatasetActive(hexString: string): ParsedDataset | null {
  if (!hexString || hexString.length === 0) return null;

  try {
    // Convert hex string to Buffer
    const buffer = Buffer.from(hexString, "hex");
    if (buffer.length === 0) return null;

    const result: ParsedDataset = {};
    let offset = 0;

    // Parse các TLV
    while (offset < buffer.length) {
      // Cần ít nhất 2 bytes cho Type và Length
      if (offset + 2 > buffer.length) break;

      const type = buffer[offset]!;
      const length = buffer[offset + 1]!;
      offset += 2;

      // Kiểm tra length hợp lệ
      if (offset + length > buffer.length) break;

      const value = buffer.subarray(offset, offset + length);
      offset += length;

      // Parse các TLV types
      switch (type) {
        case 0x00: // Channel
          // Channel là 3 bytes: channel page (1 byte) + channel number (2 bytes, big-endian)
          if (value.length >= 3) {
            const channelPage = value[0]!;
            const channelNumber = (value[1]! << 8) | value[2]!;
            result.channel = channelNumber;
            // Wake-up channel nếu có (có thể là channel page khác)
            if (channelPage === 0) {
              // 2.4 GHz band
            }
          }
          break;

        case 0x01: // PAN ID
          // PAN ID là 2 bytes (uint16, big-endian)
          if (value.length >= 2) {
            const panid = ((value[0]! << 8) | value[1]!).toString(16).padStart(4, "0");
            result.panid = `0x${panid}`;
          }
          break;

        case 0x02: // Extended PAN ID
          // Extended PAN ID là 8 bytes
          if (value.length >= 8) {
            result.extendedPanId = value.toString("hex");
          }
          break;

        case 0x03: // Network Name
          // Network Name là string, có thể có null terminator
          const networkName = value.toString("utf8").replace(/\0/g, "").trim();
          if (networkName.length > 0) {
            result.networkName = networkName;
          }
          break;

        case 0x04: // PSKc
          // PSKc là 16 bytes
          if (value.length >= 16) {
            result.pskc = value.toString("hex");
          }
          break;

        case 0x05: // Network Key
          // Network Key là 16 bytes
          if (value.length >= 16) {
            result.networkKey = value.toString("hex");
          }
          break;

        case 0x07: // Mesh Local Prefix
          // Mesh Local Prefix là 8 bytes (64-bit prefix)
          if (value.length >= 8) {
            // Format: fde8:50af:bc1:5990::/64
            const prefixHex = value.toString("hex");
            const segments: string[] = [];
            for (let i = 0; i < 8; i += 2) {
              const seg = ((value[i]! << 8) | value[i + 1]!).toString(16);
              segments.push(seg);
            }
            result.meshLocalPrefix = segments.join(":") + "::/64";
          }
          break;

        case 0x0c: // Security Policy
          // Security Policy là 2 bytes
          if (value.length >= 2) {
            const policy = (value[0]! << 8) | value[1]!;
            const rotationTime = policy & 0x7f;
            const flags = (policy >> 7) & 0x1ff;
            result.securityPolicy = `${policy} onrc ${flags}`;
          }
          break;

        case 0x0e: // Active Timestamp
          // Active Timestamp là 8 bytes (uint64, big-endian)
          if (value.length >= 8) {
            // Parse uint64 big-endian
            let timestamp = 0n;
            for (let i = 0; i < 8; i++) {
              timestamp = (timestamp << 8n) | BigInt(value[i]!);
            }
            result.activeTimestamp = timestamp.toString();
          }
          break;

        case 0x35: // Channel Mask
          // Channel Mask là variable length
          if (value.length > 0) {
            // Format as hex
            result.channelMask = "0x" + value.toString("hex");
          }
          break;

        // Các TLV types khác bỏ qua
        default:
          break;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    // Parse lỗi, trả về null
    return null;
  }
}
