/**
 * Table Parser - Parse binary table data từ Border Router theo format trong Documents/protocol/table_data_format.md
 */

export interface RouterEntry {
  routerId: number; // 0-62
  rloc16: number; // 16-bit RLOC
  extAddress: number[]; // 8 bytes EUI-64
  linkQualityIn: number; // 0-3
  linkQualityOut: number; // 0-3
  age: number; // seconds
}

export interface ChildEntry {
  childId: number; // 0-511
  rloc16: number; // 16-bit RLOC
  extAddress: number[]; // 8 bytes EUI-64
  linkQualityIn: number; // 0-3
  averageRssi: number; // dBm (signed)
  fullThreadDevice: boolean;
  rxOnWhenIdle: boolean;
  age: number; // seconds
}

export interface JoinerEntry {
  type: number; // 0=ANY, 1=EUI64, 2=DISCERNER
  sharedId?: {
    eui64?: number[]; // 8 bytes
    discerner?: {
      length: number; // bits
      value: bigint; // value
    };
  };
  pskd: string; // UTF-8 string
  expirationTime: number; // milliseconds
}

export type TableData = { headers: string[]; rows: string[][]; error?: string } | null;

/**
 * Parse Router Table từ binary data.
 * Format: [count: 1 byte] + [entry1: 15 bytes] + [entry2: 15 bytes] + ...
 */
export function parseRouterTable(data: Buffer): TableData {
  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  try {
    const count = data[0]!;
    if (count === 0) {
      return { headers: ["RouterId", "RLOC16", "ExtAddress", "LinkQualityIn", "LinkQualityOut", "Age"], rows: [] };
    }

    const entries: RouterEntry[] = [];
    let offset = 1;

    for (let i = 0; i < count; i++) {
      if (offset + 15 > data.length) {
        return { headers: [], rows: [], error: `Incomplete entry at index ${i}` };
      }

      const routerId = data[offset]!;
      const rloc16 = (data[offset + 1]! << 8) | data[offset + 2]!;
      const extAddress = Array.from(data.slice(offset + 3, offset + 11));
      const linkQualityIn = data[offset + 11]!;
      const linkQualityOut = data[offset + 12]!;
      const age = (data[offset + 13]! << 8) | data[offset + 14]!;

      entries.push({
        routerId,
        rloc16,
        extAddress,
        linkQualityIn,
        linkQualityOut,
        age,
      });

      offset += 15;
    }

    // Convert to TableData format
    const headers = ["RouterId", "RLOC16", "ExtAddress", "LinkQualityIn", "LinkQualityOut", "Age"];
    const rows = entries.map((entry) => [
      entry.routerId.toString(),
      `0x${entry.rloc16.toString(16).padStart(4, "0")}`,
      entry.extAddress.map((b) => b.toString(16).padStart(2, "0")).join(":"),
      entry.linkQualityIn.toString(),
      entry.linkQualityOut.toString(),
      entry.age.toString(),
    ]);

    return { headers, rows };
  } catch (err) {
    return { headers: [], rows: [], error: `Parse error: ${(err as Error)?.message ?? err}` };
  }
}

/**
 * Parse Child Table từ binary data.
 * Format: [count: 1 byte] + [entry1: 17 bytes] + [entry2: 17 bytes] + ...
 */
export function parseChildTable(data: Buffer): TableData {
  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  try {
    const count = data[0]!;
    if (count === 0) {
      return {
        headers: ["ChildId", "RLOC16", "ExtAddress", "LinkQualityIn", "AverageRssi", "FullThreadDevice", "RxOnWhenIdle", "Age"],
        rows: [],
      };
    }

    const entries: ChildEntry[] = [];
    let offset = 1;

    for (let i = 0; i < count; i++) {
      if (offset + 17 > data.length) {
        return { headers: [], rows: [], error: `Incomplete entry at index ${i}` };
      }

      const childId = data[offset]!;
      const rloc16 = (data[offset + 1]! << 8) | data[offset + 2]!;
      const extAddress = Array.from(data.slice(offset + 3, offset + 11));
      const linkQualityIn = data[offset + 11]!;
      // Convert unsigned byte to signed int8 for RSSI
      const rssiByte = data[offset + 12]!;
      const averageRssi = rssiByte > 127 ? rssiByte - 256 : rssiByte;
      const fullThreadDevice = data[offset + 13]! === 1;
      const rxOnWhenIdle = data[offset + 14]! === 1;
      const age = (data[offset + 15]! << 8) | data[offset + 16]!;

      entries.push({
        childId,
        rloc16,
        extAddress,
        linkQualityIn,
        averageRssi,
        fullThreadDevice,
        rxOnWhenIdle,
        age,
      });

      offset += 17;
    }

    // Convert to TableData format
    const headers = ["ChildId", "RLOC16", "ExtAddress", "LinkQualityIn", "AverageRssi", "FullThreadDevice", "RxOnWhenIdle", "Age"];
    const rows = entries.map((entry) => [
      entry.childId.toString(),
      `0x${entry.rloc16.toString(16).padStart(4, "0")}`,
      entry.extAddress.map((b) => b.toString(16).padStart(2, "0")).join(":"),
      entry.linkQualityIn.toString(),
      `${entry.averageRssi} dBm`,
      entry.fullThreadDevice ? "FTD" : "MTD",
      entry.rxOnWhenIdle ? "Yes" : "No",
      entry.age.toString(),
    ]);

    return { headers, rows };
  } catch (err) {
    return { headers: [], rows: [], error: `Parse error: ${(err as Error)?.message ?? err}` };
  }
}

/**
 * Parse Joiner Table từ binary data.
 * Format: [count: 1 byte] + [entry1: variable] + [entry2: variable] + ...
 */
export function parseJoinerTable(data: Buffer): TableData {
  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  try {
    const count = data[0]!;
    if (count === 0) {
      return { headers: ["Type", "SharedId", "PSKD", "Expiration"], rows: [] };
    }

    const entries: JoinerEntry[] = [];
    let offset = 1;

    for (let i = 0; i < count; i++) {
      if (offset >= data.length) {
        return { headers: [], rows: [], error: `Incomplete entry at index ${i}` };
      }

      const type = data[offset++]!;
      const entry: JoinerEntry = { type, pskd: "", expirationTime: 0 };

      // Parse SharedId
      if (type === 0x01) {
        // EUI64
        if (offset + 8 > data.length) {
          return { headers: [], rows: [], error: `Incomplete EUI64 at index ${i}` };
        }
        entry.sharedId = {
          eui64: Array.from(data.slice(offset, offset + 8)),
        };
        offset += 8;
      } else if (type === 0x02) {
        // DISCERNER
        if (offset >= data.length) {
          return { headers: [], rows: [], error: `Incomplete discerner length at index ${i}` };
        }
        const discernerLength = data[offset++]!;
        const discernerBytes = Math.ceil(discernerLength / 8);
        if (offset + discernerBytes > data.length) {
          return { headers: [], rows: [], error: `Incomplete discerner value at index ${i}` };
        }
        let discernerValue = 0n;
        for (let j = 0; j < discernerBytes; j++) {
          discernerValue = (discernerValue << 8n) | BigInt(data[offset + j]!);
        }
        entry.sharedId = {
          discerner: {
            length: discernerLength,
            value: discernerValue,
          },
        };
        offset += discernerBytes;
      } else {
        // ANY (0x00) - skip 8 bytes padding
        if (offset + 8 > data.length) {
          return { headers: [], rows: [], error: `Incomplete ANY padding at index ${i}` };
        }
        offset += 8;
      }

      // Parse PSKD
      if (offset >= data.length) {
        return { headers: [], rows: [], error: `Incomplete PSKD length at index ${i}` };
      }
      const pskdLength = data[offset++]!;
      if (offset + pskdLength > data.length) {
        return { headers: [], rows: [], error: `Incomplete PSKD at index ${i}` };
      }
      entry.pskd = data.slice(offset, offset + pskdLength).toString("utf8");
      offset += pskdLength;

      // Parse ExpirationTime (4 bytes, big-endian)
      if (offset + 4 > data.length) {
        return { headers: [], rows: [], error: `Incomplete expiration time at index ${i}` };
      }
      entry.expirationTime = (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!;
      offset += 4;

      entries.push(entry);
    }

    // Convert to TableData format
    const headers = ["Type", "SharedId", "PSKD", "Expiration"];
    const rows = entries.map((entry) => {
      let sharedIdStr = "";
      if (entry.sharedId?.eui64) {
        sharedIdStr = entry.sharedId.eui64.map((b) => b.toString(16).padStart(2, "0")).join(":");
      } else if (entry.sharedId?.discerner) {
        sharedIdStr = `Discerner(${entry.sharedId.discerner.length}bits):${entry.sharedId.discerner.value.toString(16)}`;
      } else {
        sharedIdStr = "ANY";
      }

      const typeStr = entry.type === 0x00 ? "ANY" : entry.type === 0x01 ? "EUI64" : "DISCERNER";

      return [typeStr, sharedIdStr, entry.pskd, entry.expirationTime.toString()];
    });

    return { headers, rows };
  } catch (err) {
    return { headers: [], rows: [], error: `Parse error: ${(err as Error)?.message ?? err}` };
  }
}
