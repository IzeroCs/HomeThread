# Thread-Node: Gửi dữ liệu lên Dashboard (CoAP + CBOR)

Tài liệu này dành cho **Thread-Node** (firmware thiết bị child/endpoint) khi cần gửi dữ liệu lên OpenThread Dashboard backend. Backend nhận qua **CoAP**, payload **CBOR** (nhẹ), sau đó chỉ chuyển subset cần thiết lên frontend.

## Luồng tổng quan

```
Thread-Node (child)  --[CoAP + CBOR, full payload]-->  Backend (Dashboard)
Backend              --[WebSocket, subset only]-->     Frontend (Dashboard UI)
```

- **Child → Backend**: Gửi **full** payload (CBOR). Backend parse CBOR → JSON nội bộ.
- **Backend → Frontend**: Chỉ gửi dữ liệu cần thiết (type, rloc16?, timestamp, summary). Không forward full payload.

## Lấy Backend IP/port bằng SRP/DNS-SD (tự scan)

- **Ưu tiên:** Thread-Node **tự scan** service `_dashboard._udp` trên mạng Thread (qua SRP server của BR) để lấy IP và port backend, không cần hardcode.
- **Cách làm:** Browse `_dashboard._udp.default.svc.arpa` (OpenThread SRP client API hoặc DNS-SD browse) → chọn một instance (vd. đầu tiên hoặc theo TXT `ver`) → đọc bản ghi SRV (port, target hostname) → resolve A/AAAA cho target → được **IPv6 + port**.
- **Cache:** Lưu IP + port vào NVS; lần sau có thể dùng cache, refresh khi CoAP fail hoặc định kỳ.
- **Fallback:** Nếu browse không thấy service `_dashboard._udp` → dùng **cấu hình tĩnh** (IP/port lưu trong NVS hoặc commissioning).

**Spec service (backend đăng ký):** type `_dashboard._udp`, domain `default.svc.arpa`, instance `dashboard`, port 5683, TXT `ver=1`, `proto=coap+cbor`, `path=/child`. Dashboard-Thread backend gửi đăng ký qua **frame protocol** (CMD_SRP_REGISTER 0x44) tới BR khi BR là leader; BR submit lên SRP server. Chi tiết: [../architecture/real_br_integration.md](../architecture/real_br_integration.md).

## CoAP

- **Giao thức**: Chỉ CoAP (không HTTP).
- **Port**: **5683** (UDP), cùng host với backend Dashboard.
- **Địa chỉ**: `coap://<IP-backend>:5683/child/<type>`
  - `<IP-backend>`: IP của máy chạy backend (lấy từ discovery ở trên hoặc cấu hình tĩnh; phải route được từ Thread network qua BR).
  - `<type>`: `register` | `update` | `ping` (hoặc path tùy chọn; backend dùng path làm `type` cho frontend).

### Resource paths

| Path | Ý nghĩa (gợi ý) |
|------|------------------|
| `/child/register` | Đăng ký node (lần đầu / sau khi join) |
| `/child/update`   | Cập nhật trạng thái / sensor / metadata |
| `/child/ping`     | Ping / keepalive |

Method: POST (CoAP request có body). Body = payload CBOR.

## Payload CBOR

- **Format**: CBOR (Concise Binary Object Representation), nhẹ hơn JSON.
- **Gợi ý schema** (dùng numeric key để ít byte):
  - **Register**: `{ 0: "register", 1: rloc16, 2: extAddr?, 3: metadata? }`
  - **Update**: `{ 0: "update", 1: rloc16, 2: data? }`
  - **Ping**: `{ 0: "ping", 1: rloc16 }`

Backend đọc key `1` làm RLOC16 để đưa vào subset gửi frontend. Các field khác bạn có thể gửi full (backend giữ nội bộ, không đẩy hết lên UI).

## Backend nhận và trả về

- Backend (Dashboard) listen UDP 5683, parse CBOR, build object nhẹ gồm: `type` (từ path), `rloc16?` (từ payload key 1), `timestamp` (backend thêm), `summary` (chuỗi ngắn cho UI).
- CoAP response: **2.01 Created** khi xử lý xong.
- Frontend nhận qua WebSocket event `child:data`, hiển thị tại trang **Status** → section **Child data (CoAP)**.

## Ví dụ (pseudo)

- Gửi register: `POST coap://192.168.1.10:5683/child/register`, body = CBOR `{ 0: "register", 1: "0xfc01", 2: "ext-addr-hex" }`.
- Backend log "CoAP child data server listening on port 5683" khi đã sẵn sàng nhận.

## Tài liệu liên quan

- Dashboard backend: `backend/src/server/CoapChildDataServer.ts`
- Event & type: `shared/src/events.ts` (`CHILD_DATA`), `shared/src/types.ts` (`ChildDataPayload`)
