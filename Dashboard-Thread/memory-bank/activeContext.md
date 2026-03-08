# Active Context — Dashboard-Thread

## Current Work Focus

Backend giao tiep **OTBR qua REST API**. OtbrManager dung OtbrRestClient; poll state 30s (khong con D-Bus signal). Frontend BR Connection = "OTBR (REST)" + Test. **BrConnectionConfigService da bo** (backend + frontend): CONFIG_CURRENT = null, khong config/getConfig/saveConfig. **Supervisor** van dung: Unix socket restart-otbr + watch device.

## Recent Significant Changes

### OTBR REST (thay D-Bus)
- **OtbrRestClient:** HTTP toi OTBR (OTBR_REST_URL, port 8081). GET /node/state, /node/dataset/active, PUT /node/state, setActiveDataset, addJoiner qua /node/commissioner/joiner; router/child table tu /api/devices.
- **OtbrManager:** Poll state 30s (khong con signal). Tables van poll 6s khi co frontend + state active.

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

### Docker + OTBR REST
- **Backend thay OTBR:** Ket noi qua REST (OTBR_REST_URL, mac dinh http://127.0.0.1:8081). OTBR can build OTBR_REST=ON, listen 0.0.0.0:8081. Compose bo volume otbr-dbus; backend (host hoac container) goi HTTP toi OTBR:8081.

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
- `backend/src/supervisor/socket.client.ts` — requestSupervisor(), restartOtbr(); SUPERVISOR_SOCK_DIR
- `backend/src/otbr/otbr-rest-client.ts` — REST client (GET /node/state, dataset, PUT, POST commissioner)
- `backend/src/otbr/otbr.manager.ts` — pullStateOtbr(), poll 30s
- `backend/src/server/coap-device.server.ts` — CoAP device (path /device/); GET ping → 2.05 + 4-byte timestamp; POST → CBOR decode (backend/src/cbor), log JSON, tra 2.01
- `backend/src/utils/ipv6.util.ts` — getBackendAddresses()
- `frontend/src/components/nodes/nodes.component.tsx` — Router/Child table, JoinerList, CommissionNodeModal
- `frontend/src/components/nodes/joiner-list/joiner-list.component.tsx` — joiner cards, countdown
- `frontend/src/components/common/toast-container/` — toast dark
- `frontend/src/components/common/modal/`, `confirm-modal/` — dark navy theme
- `frontend/src/components/common/sidebar/` — nav, Settings sub-items icons
- `frontend/src/components/settings/system-tab/` — action cards, danger divider
- `frontend/src/components/settings/openthread-config-form/openthread-config-form.style.scss` — ot-card, footer layout
- `shared/src/events.ts`, `shared/src/types.ts` — thêm field/event cập nhật cả hai
- `memory-bank/progress.md` — cập nhật khi hoàn thành task
