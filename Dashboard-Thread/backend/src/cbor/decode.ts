/**
 * CBOR decoder — in-backend implementation for /device/register payload (RFC 7049).
 * Supports: unsigned/negative int, byte string, text string, array, map, indefinite map/array, break, bool, float32.
 * Decodes map keys to string (e.g. 0 → "0") so result is JSON-serializable and no external cbor package needed.
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
const ADDITIONAL_INDEFINITE = 31;

const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_BREAK = 31;

export class CborDecodeError extends Error {
  constructor(message: string, public offset?: number) {
    super(message);
    this.name = "CborDecodeError";
  }
}

export function cborDecode(input: Uint8Array): unknown {
  let pos = 0;

  function need(n: number): void {
    if (pos + n > input.length) {
      throw new CborDecodeError(`Unexpected end of input (need ${n} bytes at offset ${pos})`, pos);
    }
  }

  function readByte(): number {
    need(1);
    return input[pos++]!;
  }

  function readUint16(): number {
    need(2);
    const a = input[pos]!;
    const b = input[pos + 1]!;
    pos += 2;
    return (a << 8) | b;
  }

  function readUint32(): number {
    need(4);
    const a = input[pos]!;
    const b = input[pos + 1]!;
    const c = input[pos + 2]!;
    const d = input[pos + 3]!;
    pos += 4;
    return (a << 24) | (b << 16) | (c << 8) | d;
  }

  function readUint64(): number {
    need(8);
    const hi = (input[pos]! << 24) | (input[pos + 1]! << 16) | (input[pos + 2]! << 8) | input[pos + 3]!;
    const lo = (input[pos + 4]! << 24) | (input[pos + 5]! << 16) | (input[pos + 6]! << 8) | input[pos + 7]!;
    pos += 8;
    if (hi > 0x1fffffffffffff) {
      throw new CborDecodeError(`Integer out of safe range at offset ${pos - 8}`, pos - 8);
    }
    return hi * 0x1_0000_0000 + (lo >>> 0);
  }

  function readLength(ai: number): number {
    if (ai < ADDITIONAL_ONE) return ai;
    if (ai === ADDITIONAL_ONE) return readByte();
    if (ai === ADDITIONAL_TWO) return readUint16();
    if (ai === ADDITIONAL_FOUR) return readUint32();
    if (ai === ADDITIONAL_EIGHT) return readUint64();
    return -1;
  }

  function decodeOne(): unknown {
    need(1);
    const byte = readByte();
    const major = byte >>> 5;
    const ai = byte & 31;

    if (major === MAJOR_UNSIGNED) {
      if (ai < 24) return ai;
      if (ai === ADDITIONAL_ONE) return readByte();
      if (ai === ADDITIONAL_TWO) return readUint16();
      if (ai === ADDITIONAL_FOUR) return readUint32();
      if (ai === ADDITIONAL_EIGHT) return readUint64();
      throw new CborDecodeError(`Invalid unsigned additional info ${ai}`, pos - 1);
    }

    if (major === MAJOR_NEGATIVE) {
      let n: number;
      if (ai < 24) n = ai;
      else if (ai === ADDITIONAL_ONE) n = readByte();
      else if (ai === ADDITIONAL_TWO) n = readUint16();
      else if (ai === ADDITIONAL_FOUR) n = readUint32();
      else if (ai === ADDITIONAL_EIGHT) n = readUint64();
      else throw new CborDecodeError(`Invalid negative additional info ${ai}`, pos - 1);
      return -1 - n;
    }

    if (major === MAJOR_BYTE_STRING) {
      if (ai === ADDITIONAL_INDEFINITE) {
        const chunks: Uint8Array[] = [];
        while (true) {
          const b = readByte();
          const m = b >>> 5;
          const a = b & 31;
          if (m === MAJOR_SIMPLE && a === SIMPLE_BREAK) break;
          pos--;
          chunks.push(decodeOne() as Uint8Array);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        return out;
      }
      const len = readLength(ai);
      if (len < 0) throw new CborDecodeError(`Invalid byte string additional info ${ai}`, pos - 1);
      need(len);
      const slice = input.subarray(pos, pos + len);
      pos += len;
      return new Uint8Array(slice);
    }

    if (major === MAJOR_TEXT_STRING) {
      if (ai === ADDITIONAL_INDEFINITE) {
        const parts: string[] = [];
        while (true) {
          const b = readByte();
          const m = b >>> 5;
          const a = b & 31;
          if (m === MAJOR_SIMPLE && a === SIMPLE_BREAK) break;
          pos--;
          parts.push(decodeOne() as string);
        }
        return parts.join("");
      }
      const len = readLength(ai);
      if (len < 0) throw new CborDecodeError(`Invalid text string additional info ${ai}`, pos - 1);
      need(len);
      const slice = input.subarray(pos, pos + len);
      pos += len;
      return new TextDecoder("utf8", { fatal: true }).decode(slice);
    }

    if (major === MAJOR_ARRAY) {
      if (ai === ADDITIONAL_INDEFINITE) {
        const arr: unknown[] = [];
        while (true) {
          const b = readByte();
          const m = b >>> 5;
          const a = b & 31;
          if (m === MAJOR_SIMPLE && a === SIMPLE_BREAK) break;
          pos--;
          arr.push(decodeOne());
        }
        return arr;
      }
      const len = readLength(ai);
      if (len < 0) throw new CborDecodeError(`Invalid array additional info ${ai}`, pos - 1);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) arr.push(decodeOne());
      return arr;
    }

    if (major === MAJOR_MAP) {
      const obj: Record<string, unknown> = {};
      if (ai === ADDITIONAL_INDEFINITE) {
        while (true) {
          const b = readByte();
          const m = b >>> 5;
          const a = b & 31;
          if (m === MAJOR_SIMPLE && a === SIMPLE_BREAK) break;
          pos--;
          const key = decodeOne();
          const value = decodeOne();
          const keyStr = key === null || typeof key === "object" ? JSON.stringify(key) : String(key);
          obj[keyStr] = value;
        }
      } else {
        const len = readLength(ai);
        if (len < 0) throw new CborDecodeError(`Invalid map additional info ${ai}`, pos - 1);
        for (let i = 0; i < len; i++) {
          const key = decodeOne();
          const value = decodeOne();
          const keyStr = key === null || typeof key === "object" ? JSON.stringify(key) : String(key);
          obj[keyStr] = value;
        }
      }
      return obj;
    }

    if (major === MAJOR_SIMPLE) {
      if (ai === SIMPLE_FALSE) return false;
      if (ai === SIMPLE_TRUE) return true;
      if (ai === SIMPLE_NULL) return null;
      if (ai === SIMPLE_BREAK) throw new CborDecodeError("Unexpected break", pos - 1);
      if (ai === ADDITIONAL_FOUR) {
        need(4);
        const buf = new ArrayBuffer(4);
        new Uint8Array(buf).set(input.subarray(pos, pos + 4));
        pos += 4;
        return new DataView(buf).getFloat32(0, false);
      }
      if (ai === ADDITIONAL_EIGHT) {
        need(8);
        const buf = new ArrayBuffer(8);
        new Uint8Array(buf).set(input.subarray(pos, pos + 8));
        pos += 8;
        return new DataView(buf).getFloat64(0, false);
      }
      return null;
    }

    throw new CborDecodeError(`Unsupported major type ${major}`, pos - 1);
  }

  const result = decodeOne();
  if (pos !== input.length) {
    throw new CborDecodeError(`Trailing bytes (${input.length - pos} after offset ${pos})`, pos);
  }
  return result;
}
