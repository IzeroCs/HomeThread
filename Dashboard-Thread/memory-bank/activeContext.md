# Active Context — Dashboard-Thread

## Current Work Focus

Backend giao tiep **OTBR qua D-Bus**. OtbrManager dung OtbrDbusClient; subscribe D-Bus signal **PropertiesChanged**; fallback poll 30s. Frontend BR Connection = "OTBR (D-Bus)" + Test. **BrConnectionConfigService da bo** (backend + frontend): CONFIG_CURRENT = null, khong config/getConfig/saveConfig. **Supervisor** van dung: Unix socket restart-otbr + watch device.

## Recent Significant Changes

### OTBR D-Bus + signals (1.8.0)
- **OtbrDbusClient:** Subscribe `org.freedesktop.DBus.Properties` signal **PropertiesChanged** tren object path OTBR; khi nhan signal (vd. State thay doi) goi callback → OtbrManager pull state/dataset mot lan.
- **OtbrManager:** State interval doi thanh **fallback 30s** (chi kiem tra OTBR con song); cap nhat state chinh bang signal. Tables van poll 6s khi co frontend + state active.

### CoAP device data (Thread-Node)
- **Backend:** CoAP server UDP 5683 (**CoapDeviceServer.ts**), socket **udp6** listen `[::]:5683`. Path **/device/** (register, update, ping). **GET /device/ping**: tra **2.05 Content**, payload 4 byte = timestamp uint32 LE (gia tri luc khoi tao server; restart = timestamp moi → node so sanh va gui lai register). **POST /device/register**, update: nhan CBOR, parse bang **thu vien CBOR noi bo** (`backend/src/cbor`), log `CoAP CBOR -> JSON: ...` + structure (device_id, rloc16, role, entities); tra 2.01. Role trong payload la **so** (0=child, 1=router, 2=leader). **Khong emit** len frontend (da bo EVENTS.CHILD_DATA).
- **Registration model:** Thread-Node la **CoAP client** chu dong: POST register/update; GET /device/ping dinh ky → nhan timestamp → neu khac lan truoc (backend restart) thi callback trigger re-register. Neu CoAP fail thi force SRP re-discovery va gui lai.
- **CoAP ResponseTimeout (troubleshooting):** Neu node bao `Ping response error: ResponseTimeout` / `Register response error: ResponseTimeout` thi **nguyen nhan la routing/forwarding**, khong phai backend hay token/messageId. node-coap gui response ve dung `rsinfo` (source IP:port cua request). Can: (1) Host chay backend co **route** toi prefix Thread (vd. `fdb8:3795:e886:1::/64`) qua BR (next-hop link-local hoac ULA cua BR). (2) BR (vd. ESP32-S3 + RCP) phai **forward** packet tu backhaul vao Thread (border routing bat, OMR prefix duoc quang ba). Node co dia chi **mesh-local** (fd18:... theo BR) va **OMR** (fdb8:...) de backend gui response ve. Xem `docs/coap/thread_node_coap.md` (Troubleshooting) va `docs/architecture/real_br_integration.md`.
- **Docs:** `docs/coap/thread_node_coap.md` — huong dan Thread-Node (path /device/, CBOR, GET ping, SRP discovery, troubleshooting ResponseTimeout).

### UI polish (dark navy, Settings, Modal)
- **Modal / ConfirmModal:** Dark navy — overlay rgba + backdrop blur; box $card-dark, border $brand-border; title/body $text-dark, $text-dark-subtle; nut Cancel ghost, Confirm danger/warning (#ef4444, #f97316) voi hover glow.
- **Settings / System:** Action cards (Khoi dong lai + Factory Reset) voi image panel, danger divider "Vung nguy hiem"; ConfirmModal countdown 5s giu nguyen.
- **Sidebar Settings sub-items:** Icon Material Symbols — BR Connection `lan`, OpenThread `device_hub`, System `warning` (sidebar-nav-nested-icon 16px).
- **OpenThread form card:** .form-card.ot-card padding 0, overflow hidden; footer cung chieu ngang body (margin 1.75rem), khong full-bleed.

### Navigation & Pages (SCSS only, no Tailwind)
- **Sidebar:** Brand "OpenThread" ở header; nav chi **Status**, **Nodes**, **Settings** với icon `speed`, `account_tree`, `settings`; khong con Console, Topology, Commissioner tab rieng. Status dot o header Sidebar hien mau theo thread state + BR connection.
- **Nodes page:** Router Table + Child Table + **Joiner List** (ben duoi Child Table). Nut "Commission Node" mo **CommissionNodeModal** (khong con trang Commissioner rieng). Khi BR disconnect: overlay full main (blur), khong boc content; cung layout nhu khi connect. Bang trong: empty state "No routers found" / "No child nodes connected".
- **Leader row:** Chi badge "LEADER" trong cell, khong highlight nen xanh la.
- **Version:** Subtitle Status lay tu `frontend/package.json` qua Vite `__APP_VERSION__`; dong bo voi progress.md (1.0.0).

### Supervisor (socket + watch device)
- **Thu muc:** `supervisor/` (ngang backend, frontend). Python stdlib only: `server.py` (Unix socket + thread poll device), `install-supervisor-service.sh` (systemd unit `dashboard-thread-supervisor.service`).
- **Socket:** `/var/run/izerocs/supervisor.sock`. Backend hoac supervisor (ai chay truoc) deu tao folder `/var/run/izerocs`; supervisor tao sock va listen. Xac thuc bang quyen truy cap file (khong token). Protocol: mot dong lenh (`restart-otbr`, `health`) → mot dong phan hoi (`ok` hoac `error: ...`).
- **Watch device:** Neu set env `DEVICE_PATH` (vd. `/dev/ttyACM0`), thread phu poll moi `INTERVAL` giay; device mat → `docker restart OTBR_CONTAINER_NAME`. Env: `OTBR_CONTAINER_NAME`, `DEVICE_PATH`, `INTERVAL`, `DOCKER`. Service ExecStartPre bat IP forwarding (IPv4 + IPv6).
- **Backend:** Khoi dong tao folder `/var/run/izerocs` (mkdirSync). `backend/src/supervisor/socketClient.ts`: `requestSupervisor(cmd)`, `restartOtbr()`; env `SUPERVISOR_SOCK_DIR`. Backend Docker can mount `/var/run/izerocs:/var/run/izerocs` de thay sock.
- **OTBR:** Da xoa `otbr/install-otbr-watch-service.sh`, `otbr/otbr-watch-device.sh`. Chi con `otbr-entrypoint.sh` (doi RCP roi exec /init). Doc `otbr/README.md` tro sang supervisor.

### Docker backend + OTBR D-Bus
- **Backend tren host khong thay OTBR:** Mount D-Bus host vao container OTBR da thu — otbr-agent co env DBUS_SYSTEM_BUS_ADDRESS nhung **khong dang ky** tren host bus (ListNames tren host khong co io.openthread.BorderRouter.wpan0). Nguyen nhan kha nang: dbus-daemon host tu choi ket noi tu process trong container.
- **Cach dung:** Chay **backend trong Docker** voi volume `otbr-dbus:/run/dbus` cung service OTBR, env `DBUS_SYSTEM_BUS_ADDRESS=unix:path=/run/dbus/system_bus_socket`. Compose can co service backend (build Dockerfile.backend) mount otbr-dbus. Dev: mount source backend vao container (vd. `.:/app`) de sua code tren host khong can build lai image. Doc: `backend/README.docker.md` (neu co).

### Documentation (truoc do)
- Tao `HomeThread/Documents/`, symlink docs, Memory Bank

### Backend (truoc do)
- shared/, CMD_*, leaderRloc16, auto-start Thread, filter log TABLE

### Frontend
- **Toast:** Dark theme; thanh doc trai mau theo type (success/error/warning/info); title tu type (Thanh cong/Loi/Canh bao/Tro giup), message muted; nut dong goc phai; slide-in tu phai, fade-out khi exit.
- **Nodes:** Router Table, Child Table, Joiner List (EUI64, TIMEOUT MM:SS countdown local tu initialSeconds khi co data moi), Commission Node modal. Stable keys: joiner `joiner-${sharedId}-${expirationMs}`; router/child row RLOC16 hoac ExtAddress; modal list fieldKey; LqBarsCell `lq-bar-${i}`.
- **Joiner countdown:** Khi nhan bang joiner: tinh initialSeconds = expirationMs/1000, luu receivedAt; dem nguoc local moi giay; co data moi thi reset snapshot.
- ConfirmModal (countdown 5s), Sidebar status dot, Settings/OpenThread + System; Status: threadVersion, ipaddr, datasetActive.

## Active Decisions & Considerations

### Validation Strategy (confirmed)
Frontend chi check "khong trong" — backend xu ly moi validation chi tiet. Khong duplicate validation logic.

### CMD_SET_CHANNEL Data Format (confirmed)
Channel la `uint8_t` (1 byte), khong phai 3 byte. Range 11-26. Constant trong `shared/src/constants.ts`.

### leaderRloc16 Source
Lay tu getActiveDataset / IP hoac dataset (OtConfig.leaderRloc16).

## Next Steps (theo thu tu uu tien)

1. **Security** *(neu can)* — auth WS, HTTPS
2. **OTBR config tu backend** *(neu can)* — Backend ghi file config (serial, baudrate, interface), goi `restartOtbr()` qua supervisor socket; entrypoint OTBR doc file khi start

## Files to Watch

- `supervisor/server.py` — socket + watch device; env DEVICE_PATH, OTBR_CONTAINER_NAME, INTERVAL
- `supervisor/install-supervisor-service.sh` — systemd unit dashboard-thread-supervisor
- `backend/src/supervisor/socketClient.ts` — requestSupervisor(), restartOtbr(); SUPERVISOR_SOCK_DIR
- `backend/src/otbr/OtbrDbusClient.ts` — D-Bus client, subscribe PropertiesChanged
- `backend/src/otbr/OtbrManager.ts` — pullStateOtbr(), state signal callback, fallback interval 30s
- `backend/src/server/CoapDeviceServer.ts` — CoAP device (path /device/); GET ping → 2.05 + 4-byte timestamp; POST → CBOR decode (backend/src/cbor), log JSON, tra 2.01
- `backend/src/utils/ipv6.ts` — getBackendAddresses()
- `docs/otbr/dbus_backend.md` — OTBR D-Bus API
- `frontend/src/components/Nodes/Nodes.tsx` — Router/Child table, JoinerList, CommissionNodeModal
- `frontend/src/components/Nodes/JoinerList.tsx` — joiner cards, countdown (snapshot + now)
- `frontend/src/components/common/ToastContainer.tsx` + `ToastContainer.scss` — toast dark
- `frontend/src/components/common/Modal.scss`, `ConfirmModal.scss` — dark navy theme
- `frontend/src/components/common/Sidebar.tsx` + `Sidebar.scss` — nav, Settings sub-items icons
- `frontend/src/components/Settings/SystemTab.tsx` + `SystemTab.scss` — action cards, danger divider
- `frontend/src/components/Settings/OpenThreadConfigForm.scss` — ot-card, footer layout
- `shared/src/events.ts`, `shared/src/types.ts` — thêm field/event cập nhật cả hai
- `memory-bank/progress.md` — cập nhật khi hoàn thành task
