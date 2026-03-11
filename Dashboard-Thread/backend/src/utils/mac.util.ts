/**
 * MAC / binary helpers: bytes ↔ hex, EUI-64 (8-byte) conversion.
 */

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out.toLowerCase();
}

/** Coerce unknown to Uint8Array (CBOR bstr, Node Buffer, ArrayBuffer). */
export function asUint8Array(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeBuf = v as any;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(maybeBuf)) return maybeBuf as Uint8Array;
  return null;
}

/** Convert payload mac_address (CBOR bstr(8), EUI-64) to 16-char hex string. Throws if missing/invalid. */
export function macAddressToHex(v: unknown): string {
  const bytes = asUint8Array(v);
  if (!bytes) throw new Error("mac_address (key 0) must be CBOR bstr(8)");
  if (bytes.length !== 8) throw new Error(`mac_address (key 0) invalid length=${bytes.length}, expected 8`);
  return bytesToHex(bytes);
}
