# Table Data Format

Tài liệu này mô tả format dữ liệu trả về từ Border Router (BR) cho các lệnh **Pull** để lấy Router Table, Child Table, và Commissioner Joiner Table.

## Tổng quan

Khi backend gửi các lệnh sau đến BR:
- `CMD_ROUTER_TABLE` (0x30)
- `CMD_CHILD_TABLE` (0x31)
- `CMD_JOINER_TABLE` (0x32)

BR sẽ trả về `CMD_ACK` với Frame ID tương ứng, kèm theo DATA chứa danh sách entries.

## Format chung

Tất cả các table đều có format:
```
DATA = [count: 1 byte] + [entry1] + [entry2] + ... + [entryN]
```

- **count**: Số lượng entries (0-255)
- **entry1..entryN**: Dữ liệu của từng entry, format khác nhau tùy loại table

---

## 1. Router Table (`CMD_ROUTER_TABLE`)

### Format DATA
```
DATA = [count: 1 byte] + [entry1: 15 bytes] + [entry2: 15 bytes] + ... + [entryN: 15 bytes]
```

### Format mỗi entry (15 bytes, fixed-size)

| Offset | Size | Field | Mô tả |
|--------|------|-------|-------|
| 0 | 1 | RouterId | Router ID (0-62) |
| 1-2 | 2 | RLOC16 | Routing Locator 16-bit (big-endian) |
| 3-10 | 8 | ExtAddress | Extended Address (EUI-64), 8 bytes |
| 11 | 1 | LinkQualityIn | Link Quality In (0-3) |
| 12 | 1 | LinkQualityOut | Link Quality Out (0-3) |
| 13-14 | 2 | Age | Age in seconds (big-endian) |

### Ví dụ parse (JavaScript/TypeScript)
```typescript
function parseRouterTable(data: Uint8Array): RouterEntry[] {
    const count = data[0];
    const entries: RouterEntry[] = [];
    let offset = 1;
    
    for (let i = 0; i < count; i++) {
        entries.push({
            routerId: data[offset],
            rloc16: (data[offset + 1] << 8) | data[offset + 2],
            extAddress: Array.from(data.slice(offset + 3, offset + 11)),
            linkQualityIn: data[offset + 11],
            linkQualityOut: data[offset + 12],
            age: (data[offset + 13] << 8) | data[offset + 14]
        });
        offset += 15;
    }
    
    return entries;
}
```

---

## 2. Child Table (`CMD_CHILD_TABLE`)

### Format DATA
```
DATA = [count: 1 byte] + [entry1: 17 bytes] + [entry2: 17 bytes] + ... + [entryN: 17 bytes]
```

### Format mỗi entry (17 bytes, fixed-size)

| Offset | Size | Field | Mô tả |
|--------|------|-------|-------|
| 0 | 1 | ChildId | Child ID (0-511) |
| 1-2 | 2 | RLOC16 | Routing Locator 16-bit (big-endian) |
| 3-10 | 8 | ExtAddress | Extended Address (EUI-64), 8 bytes |
| 11 | 1 | LinkQualityIn | Link Quality In (0-3) |
| 12 | 1 | AverageRssi | Average RSSI (signed int8, dBm) |
| 13 | 1 | FullThreadDevice | 1 = FTD, 0 = MTD |
| 14 | 1 | RxOnWhenIdle | 1 = true, 0 = false |
| 15-16 | 2 | Age | Age in seconds (big-endian) |

### Ví dụ parse (JavaScript/TypeScript)
```typescript
function parseChildTable(data: Uint8Array): ChildEntry[] {
    const count = data[0];
    const entries: ChildEntry[] = [];
    let offset = 1;
    
    for (let i = 0; i < count; i++) {
        entries.push({
            childId: data[offset],
            rloc16: (data[offset + 1] << 8) | data[offset + 2],
            extAddress: Array.from(data.slice(offset + 3, offset + 11)),
            linkQualityIn: data[offset + 11],
            averageRssi: data[offset + 12] - 128, // Convert unsigned to signed
            fullThreadDevice: data[offset + 13] === 1,
            rxOnWhenIdle: data[offset + 14] === 1,
            age: (data[offset + 15] << 8) | data[offset + 16]
        });
        offset += 17;
    }
    
    return entries;
}
```

---

## 3. Commissioner Joiner Table (`CMD_JOINER_TABLE`)

### Format DATA
```
DATA = [count: 1 byte] + [entry1: variable] + [entry2: variable] + ... + [entryN: variable]
```

**Lưu ý:** Joiner Table có **variable-length entries** vì PSKD là string và SharedId có thể là EUI64 hoặc Discerner.

### Format mỗi entry (variable-length)

Mỗi entry được cấu trúc như sau:

```
[Type: 1 byte] + [SharedId: variable] + [PSKD_length: 1 byte] + [PSKD: variable] + [ExpirationTime: 4 bytes]
```

#### Type (1 byte)
- `0x00` = `OT_JOINER_INFO_TYPE_ANY` (không có SharedId)
- `0x01` = `OT_JOINER_INFO_TYPE_EUI64` (SharedId = 8 bytes EUI64)
- `0x02` = `OT_JOINER_INFO_TYPE_DISCERNER` (SharedId = 1 byte length + N bytes value)

#### SharedId (variable)

**Nếu Type = EUI64 (0x01):**
- 8 bytes: EUI-64 address

**Nếu Type = DISCERNER (0x02):**
- 1 byte: Discerner length (bits, 1-64)
- N bytes: Discerner value (big-endian, N = ceil(length/8))
  - Ví dụ: length = 12 bits → N = 2 bytes
  - Ví dụ: length = 24 bits → N = 3 bytes

**Nếu Type = ANY (0x00):**
- 8 bytes: Tất cả 0x00 (padding)

#### PSKD_length (1 byte)
- Độ dài PSKD string (0-32)

#### PSKD (variable)
- PSKD string (UTF-8), không null-terminated
- Length = PSKD_length bytes

#### ExpirationTime (4 bytes)
- Expiration time in milliseconds (big-endian, uint32)
- 0 = không expire

### Ví dụ parse (JavaScript/TypeScript)
```typescript
interface JoinerEntry {
    type: number; // 0=ANY, 1=EUI64, 2=DISCERNER
    sharedId?: {
        eui64?: Uint8Array; // 8 bytes
        discerner?: {
            length: number; // bits
            value: bigint; // value
        };
    };
    pskd: string;
    expirationTime: number; // milliseconds
}

function parseJoinerTable(data: Uint8Array): JoinerEntry[] {
    const count = data[0];
    const entries: JoinerEntry[] = [];
    let offset = 1;
    
    for (let i = 0; i < count; i++) {
        const type = data[offset++];
        const entry: JoinerEntry = { type, pskd: '', expirationTime: 0 };
        
        // Parse SharedId
        if (type === 0x01) { // EUI64
            entry.sharedId = {
                eui64: new Uint8Array(data.slice(offset, offset + 8))
            };
            offset += 8;
        } else if (type === 0x02) { // DISCERNER
            const discernerLength = data[offset++];
            const discernerBytes = Math.ceil(discernerLength / 8);
            let discernerValue = 0n;
            for (let j = 0; j < discernerBytes; j++) {
                discernerValue = (discernerValue << 8n) | BigInt(data[offset + j]);
            }
            entry.sharedId = {
                discerner: {
                    length: discernerLength,
                    value: discernerValue
                }
            };
            offset += discernerBytes;
        } else { // ANY
            offset += 8; // Skip padding
        }
        
        // Parse PSKD
        const pskdLength = data[offset++];
        entry.pskd = new TextDecoder().decode(data.slice(offset, offset + pskdLength));
        offset += pskdLength;
        
        // Parse ExpirationTime
        entry.expirationTime = (data[offset] << 24) | 
                               (data[offset + 1] << 16) | 
                               (data[offset + 2] << 8) | 
                               data[offset + 3];
        offset += 4;
        
        entries.push(entry);
    }
    
    return entries;
}
```

---

## Lưu ý quan trọng

1. **Endianness**: Tất cả multi-byte fields (RLOC16, Age, ExpirationTime) đều dùng **big-endian**.

2. **Buffer overflow**: Backend nên kiểm tra `LEN` trong frame header để đảm bảo đủ dữ liệu trước khi parse.

3. **Joiner Table**: Chỉ có dữ liệu khi BR đang ở chế độ Commissioner và có joiner entries. Nếu không có, `count = 0`.

4. **Empty table**: Nếu table rỗng, `count = 0`, DATA chỉ có 1 byte (count).

5. **Error handling**: Nếu BR không thể lấy dữ liệu (timeout, not ready), sẽ trả về `CMD_NACK` với error code:
   - `0x02`: Not ready (OpenThread chưa sẵn sàng)
   - `0x03`: Timeout (không acquire được OpenThread lock)

6. **Router Table**: Chỉ có entries với `mAllocated == true` (router đang active trong network).

7. **Child Table**: Chỉ có entries của children đang connected.

---

## TypeScript Interface Definitions

```typescript
interface RouterEntry {
    routerId: number;        // 0-62
    rloc16: number;          // 16-bit RLOC
    extAddress: number[];    // 8 bytes EUI-64
    linkQualityIn: number;  // 0-3
    linkQualityOut: number; // 0-3
    age: number;            // seconds
}

interface ChildEntry {
    childId: number;         // 0-511
    rloc16: number;         // 16-bit RLOC
    extAddress: number[];   // 8 bytes EUI-64
    linkQualityIn: number;  // 0-3
    averageRssi: number;    // dBm (signed)
    fullThreadDevice: boolean;
    rxOnWhenIdle: boolean;
    age: number;            // seconds
}

interface JoinerEntry {
    type: number;           // 0=ANY, 1=EUI64, 2=DISCERNER
    sharedId?: {
        eui64?: number[];   // 8 bytes
        discerner?: {
            length: number; // bits
            value: bigint;   // value
        };
    };
    pskd: string;          // UTF-8 string
    expirationTime: number; // milliseconds
}
```
