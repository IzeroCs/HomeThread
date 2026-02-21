# Progress — Dashboard-Thread

## What Works (Completed)

### Infrastructure
- [x] npm workspaces monorepo (backend + frontend + shared)
- [x] SQLite database (WAL mode, 4 migrations)
- [x] Shared package: types, events, constants, validation
- [x] pino logging voi child loggers (serialLogger, frameLogger, wsLogger)
- [x] Table log filtering (ROUTER/CHILD/JOINER TX + ACK bi an)
- [x] Cursor Memory Bank (memory-bank/)
- [x] Symlink docs → HomeThread/Documents/ (Dashboard-Thread + ESP-Thread/Thread-Host)

### Backend — Frame Protocol
- [x] Frame parser (state machine, streaming)
- [x] Frame builder + CRC8-Maxim
- [x] CommandManager: pending map, frameId rotation, timeout, ACK/NACK routing
- [x] CommunicateManager: orchestrates all hardware logic
- [x] PollingManager: poll 6s (chi khi frontend connected + state active)
- [x] Serial auto-reconnect (3s interval)
- [x] Consecutive failure guard (5 lan → close + reconnect)
- [x] Serial port KHONG dong khi server shutdown

### Backend — Commands
- [x] CMD_STATE (poll 5s, device role parse)
- [x] CMD_DATASET_ACTIVE (fetch khi state thay doi, parse TLV)
- [x] CMD_IP_ADDR (fetch khi state active, extract leaderRloc16 tu byte 14-15)
- [x] CMD_THREAD_VERSION (fetch 1 lan)
- [x] CMD_SET_PANID, SET_CHANNEL, SET_NETWORK_NAME, SET_EXTENDED_PANID, SET_NETWORK_KEY
- [x] CMD_THREAD_START, CMD_THREAD_STOP
- [x] CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE (binary parse)
- [x] CMD_COMMISSIONER_JOINER (EUI64 + PSKd Thread Base32 + timeout)
- [x] CMD_RESET, CMD_FACTORY
- [x] Auto-start Thread (thread_run_on_connect + portClosedWhileRunning flag)

### Backend — WebSocket
- [x] Toan bo EVENTS dung constant tu shared/src/events.ts
- [x] Relay OtConfig, OtThreadState, tables den frontend
- [x] Handle set config commands tu frontend
- [x] Commissioner joiner command

### Frontend — Pages
- [x] Status: serial status, OT config day du, thread state
- [x] Dashboard: Router Table + Child Table, modal chi tiet, leader highlight, age counter
- [x] Commissioner: them joiner form, danh sach joiner + expiration countdown
- [x] Console: raw hex serial data
- [x] Settings / Serial: port + baud rate + test connect
- [x] Settings / OpenThread: cau hinh network + toggle Thread + nut "Lay lai"
- [x] Settings / System: Reset + Factory Reset + ConfirmModal countdown 5s

### Frontend — Common Components
- [x] Toast notification (global, goc phai tren, fade + slide)
- [x] ConfirmModal (countdown)
- [x] TopNav (state color symbol)
- [x] Toggle switch custom (thay the checkbox)

### Documentation
- [x] HomeThread/Documents/protocol/usb_cdc_frame_structure.md
- [x] HomeThread/Documents/protocol/table_data_format.md
- [x] HomeThread/Documents/dashboard/migration_to_frame_protocol.md
- [x] README.md + TODO.md cap nhat

## What's Left to Build

### Frame Protocol
- [ ] **CMD_DATA (CBOR)**: Firmware push data → parse CBOR → update state/tables. Hien tai firmware co the gui nhung backend chua xu ly.

### Backend
- [ ] **Bao mat** *(neu can)*: Auth cho API/WebSocket, HTTPS, IP restriction

### Frontend
- [ ] **Shortcut commands**: Nut nhanh trong Console (state, scan, ...)
- [ ] **Command history**: Luu va chon lai lenh da gui (localStorage)
- [ ] **Live terminal**: Hien thi moi byte UART realtime

### Integration & Operations
- [ ] **Quyen cong serial (Linux)**: Them user vao group `dialout` hoac tao udev rule cho ESP32-H2
- [ ] **Docker**: Build backend + frontend thanh rieng docker image (chua thuc hien)

## Known Issues / Notes

- **React Strict Mode double mount**: Dev mode → double WebSocket connection → backend log "Client connected" 2 lan. Expected behavior, khong phai bug.
- **CMD_DATA chua xu ly**: Neu firmware push CMD_DATA, backend nhan nhung khong lam gi.
- **Log filter**: TABLE commands bi filter khoi console. Can xem log file de debug table data.
- **Channel la uint8_t**: 1 byte (11-26), KHONG phai 3 byte. Da sua trong CommandManager.
