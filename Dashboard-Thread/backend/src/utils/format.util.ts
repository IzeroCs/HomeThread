/**
 * Helpers format giá trị cho log (mac, rloc16, ...).
 */

import { macAddressToHex } from "./mac.util";

/** Format mac (CBOR bstr(8)) for log: 16-char hex or "-" if missing/invalid. */
export function formatMacForLog(mac: unknown): string {
  try {
    return macAddressToHex(mac);
  } catch {
    return "-";
  }
}

/** Format rloc16 (number) for log: 0xXXXX or "-" if missing/invalid. */
export function formatRloc16ForLog(rloc16: unknown): string {
  if (rloc16 == null) return "-";
  const n = typeof rloc16 === "number" ? rloc16 : Number(rloc16);
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) return "-";
  return `0x${n.toString(16).padStart(4, "0")}`;
}
