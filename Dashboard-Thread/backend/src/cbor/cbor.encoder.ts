/**
 * CBOR encoder — in-backend implementation (RFC 7049), aligned with cbor.decoder.
 * Encodes: unsigned/negative int, byte string, text string, array, map, bool, null.
 * Map keys that are numeric (number or string "0".."9") encode as CBOR int for Thread-Node compatibility.
 */

const MAJOR_UNSIGNED = 0;
const MAJOR_NEGATIVE = 1;
const MAJOR_BYTE_STRING = 2;
const MAJOR_TEXT_STRING = 3;
const MAJOR_ARRAY = 4;
const MAJOR_MAP = 5;
const MAJOR_SIMPLE = 7;

const ADDITIONAL_ONE = 24;
const ADDITIONAL_TWO = 25;
const ADDITIONAL_FOUR = 26;
const ADDITIONAL_EIGHT = 27;

const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;

const out: number[] = [];

function writeByte(b: number): void {
  out.push(b & 0xff);
}

function writeUint16(n: number): void {
  out.push((n >>> 8) & 0xff, n & 0xff);
}

function writeUint32(n: number): void {
  out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function encodeUint(n: number): void {
  if (n < 0) throw new Error("CBOR encode: unsigned expected");
  if (n < 24) {
    writeByte((MAJOR_UNSIGNED << 5) | n);
    return;
  }
  if (n <= 0xff) {
    writeByte((MAJOR_UNSIGNED << 5) | ADDITIONAL_ONE);
    writeByte(n);
    return;
  }
  if (n <= 0xffff) {
    writeByte((MAJOR_UNSIGNED << 5) | ADDITIONAL_TWO);
    writeUint16(n);
    return;
  }
  if (n <= 0xffff_ffff) {
    writeByte((MAJOR_UNSIGNED << 5) | ADDITIONAL_FOUR);
    writeUint32(n);
    return;
  }
  if (n <= Number.MAX_SAFE_INTEGER) {
    writeByte((MAJOR_UNSIGNED << 5) | ADDITIONAL_EIGHT);
    const hi = Math.floor(n / 0x1_0000_0000) >>> 0;
    const lo = (n >>> 0) >>> 0;
    writeUint32(hi);
    writeUint32(lo);
    return;
  }
  throw new Error("CBOR encode: int out of range");
}

function encodeNegInt(n: number): void {
  if (n >= 0) throw new Error("CBOR encode: negative expected");
  const v = -1 - n;
  if (v < 0) throw new Error("CBOR encode: negative int out of range");
  if (v < 24) {
    writeByte((MAJOR_NEGATIVE << 5) | v);
    return;
  }
  if (v <= 0xff) {
    writeByte((MAJOR_NEGATIVE << 5) | ADDITIONAL_ONE);
    writeByte(v);
    return;
  }
  if (v <= 0xffff) {
    writeByte((MAJOR_NEGATIVE << 5) | ADDITIONAL_TWO);
    writeUint16(v);
    return;
  }
  if (v <= 0xffff_ffff) {
    writeByte((MAJOR_NEGATIVE << 5) | ADDITIONAL_FOUR);
    writeUint32(v);
    return;
  }
  if (v <= Number.MAX_SAFE_INTEGER) {
    writeByte((MAJOR_NEGATIVE << 5) | ADDITIONAL_EIGHT);
    const hi = Math.floor(v / 0x1_0000_0000) >>> 0;
    const lo = (v >>> 0) >>> 0;
    writeUint32(hi);
    writeUint32(lo);
    return;
  }
  throw new Error("CBOR encode: negative int out of range");
}

function encodeInt(n: number): void {
  if (n >= 0) encodeUint(n);
  else encodeNegInt(n);
}

function encodeBytes(b: Uint8Array): void {
  const n = b.length;
  if (n < 24) {
    writeByte((MAJOR_BYTE_STRING << 5) | n);
  } else if (n <= 0xff) {
    writeByte((MAJOR_BYTE_STRING << 5) | ADDITIONAL_ONE);
    writeByte(n);
  } else if (n <= 0xffff) {
    writeByte((MAJOR_BYTE_STRING << 5) | ADDITIONAL_TWO);
    writeUint16(n);
  } else {
    writeByte((MAJOR_BYTE_STRING << 5) | ADDITIONAL_FOUR);
    writeUint32(n);
  }
  for (let i = 0; i < n; i++) out.push(b[i]!);
}

function encodeText(s: string): void {
  const b = new TextEncoder().encode(s);
  const n = b.length;
  if (n < 24) {
    writeByte((MAJOR_TEXT_STRING << 5) | n);
  } else if (n <= 0xff) {
    writeByte((MAJOR_TEXT_STRING << 5) | ADDITIONAL_ONE);
    writeByte(n);
  } else if (n <= 0xffff) {
    writeByte((MAJOR_TEXT_STRING << 5) | ADDITIONAL_TWO);
    writeUint16(n);
  } else {
    writeByte((MAJOR_TEXT_STRING << 5) | ADDITIONAL_FOUR);
    writeUint32(n);
  }
  for (let i = 0; i < n; i++) out.push(b[i]!);
}

/** Map key: use int if number or string that parses as integer (align with decoder / Thread-Node keys). */
function encodeMapKey(key: string | number): void {
  if (typeof key === "number" && Number.isInteger(key)) {
    encodeInt(key);
    return;
  }
  const s = String(key);
  const parsed = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  if (!Number.isNaN(parsed) && parsed <= Number.MAX_SAFE_INTEGER) {
    encodeInt(parsed);
    return;
  }
  encodeText(s);
}

function encodeOne(value: unknown): void {
  if (value === null) {
    writeByte((MAJOR_SIMPLE << 5) | SIMPLE_NULL);
    return;
  }
  if (value === true) {
    writeByte((MAJOR_SIMPLE << 5) | SIMPLE_TRUE);
    return;
  }
  if (value === false) {
    writeByte((MAJOR_SIMPLE << 5) | SIMPLE_FALSE);
    return;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      encodeInt(value);
      return;
    }
    if (Number.isFinite(value)) {
      writeByte((MAJOR_SIMPLE << 5) | ADDITIONAL_EIGHT);
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, value, false);
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < 8; i++) out.push(u8[i]!);
      return;
    }
    throw new Error("CBOR encode: invalid number");
  }
  if (typeof value === "string") {
    encodeText(value);
    return;
  }
  if (value instanceof Uint8Array) {
    encodeBytes(value);
    return;
  }
  if (Array.isArray(value)) {
    const n = value.length;
    if (n < 24) {
      writeByte((MAJOR_ARRAY << 5) | n);
    } else if (n <= 0xff) {
      writeByte((MAJOR_ARRAY << 5) | ADDITIONAL_ONE);
      writeByte(n);
    } else if (n <= 0xffff) {
      writeByte((MAJOR_ARRAY << 5) | ADDITIONAL_TWO);
      writeUint16(n);
    } else {
      writeByte((MAJOR_ARRAY << 5) | ADDITIONAL_FOUR);
      writeUint32(n);
    }
    for (let i = 0; i < n; i++) encodeOne(value[i]);
    return;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string | number, unknown>;
    const entries = Object.entries(obj);
    const n = entries.length;
    if (n < 24) {
      writeByte((MAJOR_MAP << 5) | n);
    } else if (n <= 0xff) {
      writeByte((MAJOR_MAP << 5) | ADDITIONAL_ONE);
      writeByte(n);
    } else if (n <= 0xffff) {
      writeByte((MAJOR_MAP << 5) | ADDITIONAL_TWO);
      writeUint16(n);
    } else {
      writeByte((MAJOR_MAP << 5) | ADDITIONAL_FOUR);
      writeUint32(n);
    }
    for (const [k, v] of entries) {
      const keyNum = /^\d+$/.test(k) ? parseInt(k, 10) : NaN;
      if (!Number.isNaN(keyNum)) encodeMapKey(keyNum);
      else encodeMapKey(k);
      encodeOne(v);
    }
    return;
  }
  throw new Error(`CBOR encode: unsupported type ${typeof value}`);
}

/**
 * Encode a value to CBOR (RFC 7049). Returns new Uint8Array.
 * Map keys that are numeric strings ("0", "10", ...) encode as integer keys for Thread-Node compatibility.
 */
export function cborEncode(value: unknown): Uint8Array {
  out.length = 0;
  encodeOne(value);
  return new Uint8Array(out);
}
