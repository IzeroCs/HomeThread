/**
 * CRC-8/MAXIM - poly 0x31, init 0x00
 * Input: [Frame ID, CMD, LEN_HIGH, LEN_LOW, DATA...]
 */

const POLY = 0x31;
const INIT = 0x00;

let table: Uint8Array | null = null;

function buildTable(): Uint8Array {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x80) ? (POLY ^ (crc << 1)) : (crc << 1);
      crc &= 0xff;
    }
    t[i] = crc;
  }
  return t;
}

function getTable(): Uint8Array {
  if (table == null) table = buildTable();
  return table;
}

/**
 * Tính CRC-8/MAXIM trên buffer (từ byte 0 đến hết).
 */
export function crc8Maxim(buffer: Buffer): number {
  const t = getTable();
  let crc = INIT;
  for (let i = 0; i < buffer.length; i++) {
    crc = t[crc ^ buffer[i]];
  }
  return crc;
}

/**
 * Tính CRC-8 trên phần buffer từ offset, length bytes.
 */
export function crc8MaximSlice(buffer: Buffer, offset: number, length: number): number {
  const t = getTable();
  let crc = INIT;
  const end = Math.min(offset + length, buffer.length);
  for (let i = offset; i < end; i++) {
    crc = t[crc ^ buffer[i]];
  }
  return crc;
}
