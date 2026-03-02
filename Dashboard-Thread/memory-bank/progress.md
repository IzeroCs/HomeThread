# Progress — Dashboard-Thread

Version notation in this file uses Semantic Versioning `MAJOR.MINOR.PATCH` (no leading `v`). Examples: `0.8.0`, `0.9.0`, `1.0.0`. If only major/minor are known, use `PATCH = 0`.

## Release history

*(Các mốc trước 0.9.0 suy từ migration/progress; repo không có git tag/CHANGELOG. Chỉnh sửa nếu bạn có mốc chính xác.)*

| Version | Notes |
|---------|--------|
| 0.1.0   | Thời CLI: giao tiếp OpenThread qua CLI text (trước migration frame). |
| 0.5.0   | Frame protocol: bỏ CLI, raw serial, parser/builder/CRC8, CMD_ACK/NACK, pull state, dataset parse, set config cơ bản. |
| 0.8.0   | Tables + Commissioner: CMD_ROUTER_TABLE/CHILD_TABLE/JOINER_TABLE, CMD_COMMISSIONER_JOINER, Reset/Factory, leader highlight, age/expiration countdown, Thread start/stop. |
| 0.9.0   | Shared package, Memory Bank, polish. |
| 1.0.0   | Migration BR: chi TCP, bo Serial. TransportTcp, BrConnectionConfigService, BrConnectionForm, Settings BR Connection. CMD_DATA da bo (child gui thang backend). UI: dark theme, ThreadDash branding, Status connected/disconnected (ghost grid + overlay), version tu frontend/package.json. |


## What Works (Completed)

### Infrastructure

- npm workspaces monorepo (backend + frontend + shared)
- SQLite database (WAL mode, 5 migrations: serial_config legacy, app_settings, br_connection_config)
- Shared package: types, events, constants, validation
- pino logging voi child loggers (serialLogger, frameLogger, wsLogger)
- Table log filtering (ROUTER/CHILD/JOINER TX + ACK bi an)
- Cursor Memory Bank (memory-bank/)
- Symlink docs → HomeThread/Documents/ (Dashboard-Thread + ESP-Thread/Thread-Host)

### Backend — Frame Protocol

- Frame parser (state machine, streaming)
- Frame builder + CRC8-Maxim
- CommandManager: pending map, frameId rotation, timeout, ACK/NACK routing
- CommunicateManager: orchestrates TransportTcp + frame (khong con Serial)
- TransportTcp: TCP client (open/close/writeRaw/onRawData/setOnDisconnect)
- BrConnectionConfigService: SQLite br_host, br_port, use_mdns
- PollingManager: poll 6s (chi khi frontend connected + state active)
- BR auto-reconnect (3s interval)
- Consecutive failure guard (5 lan → close + reconnect)
- TCP KHONG dong khi server shutdown

### Backend — Commands

- CMD_STATE (poll 5s, device role parse)
- CMD_DATASET_ACTIVE (fetch khi state thay doi, parse TLV)
- CMD_IP_ADDR (fetch khi state active, extract leaderRloc16 tu byte 14-15)
- CMD_THREAD_VERSION (fetch 1 lan)
- CMD_SET_PANID, SET_CHANNEL, SET_NETWORK_NAME, SET_EXTENDED_PANID, SET_NETWORK_KEY
- CMD_THREAD_START, CMD_THREAD_STOP
- CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE (binary parse)
- CMD_COMMISSIONER_JOINER (EUI64 + PSKd Thread Base32 + timeout)
- CMD_RESET, CMD_FACTORY
- Auto-start Thread (thread_run_on_connect + portClosedWhileRunning flag)

### Backend — WebSocket

- Toan bo EVENTS dung constant tu shared/src/events.ts
- Relay OtConfig, OtThreadState, tables den frontend
- Handle set config commands tu frontend
- Commissioner joiner command

### Frontend — Pages

- Status: BR connection status (host:port), OT config day du, thread state
- Dashboard: Router Table + Child Table, modal chi tiet, leader highlight, age counter
- Commissioner: them joiner form, danh sach joiner + expiration countdown
- Console: raw hex frame data tu BR
- Settings / BR Connection: host (vd. Thread-Host.local) + port (5000) + test connect
- Settings / OpenThread: cau hinh network + toggle Thread + nut "Lay lai"
- Settings / System: Reset + Factory Reset + ConfirmModal countdown 5s

### Frontend — Common Components

- Toast notification (global, goc phai tren, fade + slide)
- ConfirmModal (countdown)
- TopNav: brand "ThreadDash", nav Status / Devices / Topology / Console / Settings, state dot mau theo thread, active link co border-bottom xanh
- Toggle switch custom (thay the checkbox)

### Documentation

- HomeThread/Documents/protocol/usb_cdc_frame_structure.md
- HomeThread/Documents/protocol/table_data_format.md
- HomeThread/Documents/dashboard/migration_to_frame_protocol.md
- README.md + TODO.md cap nhat

## What's Left to Build

### Frame Protocol

- **CMD_DATA (CBOR)**: Da bo — child gui register/update/ping thang backend (CoAP/HTTP). BR chi route IP.

### Backend

- **Bao mat** *(neu can)*: Auth cho API/WebSocket, HTTPS, IP restriction

### Frontend

- **Shortcut commands**: Nut nhanh trong Console (state, scan, ...)
- **Command history**: Luu va chon lai lenh da gui (localStorage)
- **Live terminal**: Hien thi moi byte UART realtime

### Integration & Operations

- **mDNS browse** *(tuy chon)*: Backend browse `_thread-frame._tcp`, frontend nut "Tim BR" chon instance
- **Docker**: Build backend + frontend thanh rieng docker image (chua thuc hien)

## Known Issues / Notes

- **React Strict Mode double mount**: Dev mode → double WebSocket connection → backend log "Client connected" 2 lan. Expected behavior, khong phai bug.
- **CMD_DATA da bo**: Child gui thang backend; BR khong con push CMD_DATA.
- **Log filter**: TABLE commands bi filter khoi console. Can xem log file de debug table data.
- **Channel la uint8_t**: 1 byte (11-26), KHONG phai 3 byte. Da sua trong CommandManager.

