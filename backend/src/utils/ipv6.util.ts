import * as os from "os";

/**
 * Lấy danh sách IPv4 và IPv6 của máy (backend) để hiển thị trên frontend.
 * Bỏ loopback và internal. IPv6 bỏ zone id (%iface).
 */
export function getBackendAddresses(): { ipv4: string[]; ipv6: string[] } {
  const ipv4: string[] = [];
  const ipv6: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.internal) continue;
      const addr = iface.address.split("%")[0]!.trim();
      if (!addr) continue;
      if (iface.family === "IPv4") ipv4.push(addr);
      else if (iface.family === "IPv6" && addr !== "::1") ipv6.push(addr);
    }
  }
  return { ipv4, ipv6 };
}

/**
 * Lấy một IPv6 của máy để dùng cho SRP register (backend).
 * Ưu tiên: ULA (fd00::/8) → link-local (fe80::/10) → còn lại. Bỏ loopback và internal.
 * Trả về null nếu không có.
 */
export function getPreferredBackendIPv6(): string | null {
  const ifaces = os.networkInterfaces();
  const ula: string[] = [];
  const linkLocal: string[] = [];
  const other: string[] = [];
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family !== "IPv6" || iface.internal) continue;
      const addr = iface.address.split("%")[0]!.trim();
      if (!addr || addr === "::1") continue;
      if (addr.startsWith("fd")) ula.push(addr);
      else if (addr.startsWith("fe80::")) linkLocal.push(addr);
      else other.push(addr);
    }
  }
  return ula[0] ?? linkLocal[0] ?? other[0] ?? null;
}

/**
 * IPv6 string → 16 bytes (network byte order, 8 x uint16 BE).
 * Hỗ trợ dạng đầy đủ và rút gọn (::). Trả về null nếu chuỗi không hợp lệ.
 */
export function ipv6StringToBytes(s: string): Buffer | null {
  const raw = s.trim();
  if (raw.length === 0) return null;
  const parts = raw.split(":");
  if (parts.length < 2 || parts.length > 8) return null;
  const segments: number[] = [];
  let emptyIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") {
      if (emptyIndex >= 0) return null;
      emptyIndex = i;
      continue;
    }
    const num = parseInt(parts[i]!, 16);
    if (Number.isNaN(num) || num < 0 || num > 0xffff) return null;
    segments.push(num);
  }
  if (emptyIndex >= 0) {
    const before = emptyIndex;
    const after = segments.length - before;
    const need = 8 - segments.length;
    if (need < 1) return null;
    const zeros = Array(need).fill(0);
    segments.splice(before, 0, ...zeros);
  }
  if (segments.length !== 8) return null;
  const buf = Buffer.allocUnsafe(16);
  for (let i = 0; i < 8; i++) {
    buf.writeUInt16BE(segments[i]!, i * 2);
  }
  return buf;
}

/**
 * 16 byte (128 bit) → chuỗi IPv6.
 * Network byte order (big-endian): 8 đoạn 16-bit, mỗi đoạn = (byte[2*i]<<8)|byte[2*i+1].
 * Chuỗi: 8 đoạn hex (1–4 ký tự), cách nhau :; có thể rút gọn một khối 0 bằng ::.
 */
export function bytes16ToIPv6String(buf: Buffer): string {
  if (buf.length < 16) return "";
  const segments: number[] = [];
  for (let i = 0; i < 8; i++) {
    segments.push((buf[2 * i]! << 8) | buf[2 * i + 1]!);
  }
  const parts = segments.map((s) => s.toString(16));
  // Rút gọn: thay khối 0 liên tiếp dài nhất (>= 2) bằng ::
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < 8) {
    if (segments[i]! !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && segments[j] === 0) j++;
    const len = j - i;
    if (len >= 2 && len > bestLen) {
      bestStart = i;
      bestLen = len;
    }
    i = j;
  }
  if (bestLen >= 2 && bestStart !== -1) {
    const left = parts.slice(0, bestStart).join(":");
    const right = parts.slice(bestStart! + bestLen).join(":");
    if (left && right) return left + "::" + right;
    if (left) return left + "::";
    if (right) return "::" + right;
    return "::";
  }
  return parts.join(":");
}
