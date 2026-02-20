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
