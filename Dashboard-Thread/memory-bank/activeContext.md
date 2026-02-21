# Active Context — Dashboard-Thread

## Current Work Focus

Memory Bank vua duoc tao va cau truc lai theo chuan Cursor Memory Bank. Project hien tai da co day du tinh nang chinh; tap trung vao cac viec con lai trong TODO.

## Recent Significant Changes

### Documentation
- Tao `HomeThread/Documents/` lam thu muc tap trung cho toan bo tai lieu
- Chuyen cac file MD tu `Dashboard-Thread/docs/` va `ESP-Thread/Thread-Host/docs/` vao day
- Tao symlink `docs` trong `Dashboard-Thread/` va `ESP-Thread/Thread-Host/` tro toi `HomeThread/Documents/`
- Tao Cursor Memory Bank trong `Dashboard-Thread/memory-bank/`

### Backend
- Them `shared/` package (types, events, constants, validation) — dung chung cho backend va frontend
- Them cac command: CMD_SET_PANID, SET_CHANNEL, SET_NETWORK_NAME, SET_EXTENDED_PANID, SET_NETWORK_KEY
- Them CMD_THREAD_START, CMD_THREAD_STOP, CMD_THREAD_VERSION, CMD_RESET, CMD_FACTORY, CMD_COMMISSIONER_JOINER
- Them leaderRloc16 extraction tu CMD_IP_ADDR (byte 14-15 cua 16-byte IPv6)
- Auto-start Thread: check trong pullState(), dung flag portClosedWhileRunning
- Khong dong serial port khi server shutdown
- Filter log cho ROUTER/CHILD/JOINER TABLE (qua nhieu)

### Frontend
- Them `shared` package — dung EVENTS const, khong dung string literal
- Them Toast notification global (goc phai tren, fade + slide)
- Them ConfirmModal dung chung (countdown 5s cho Reset/Factory)
- Dashboard: Leader row highlight mau xanh la
- Dashboard: Age counter dem len realtime theo giay
- Commissioner: Expiration countdown (ms / 1000 = s)
- Settings/OpenThread: Toggle switch "Khoi dong Thread"
- Settings/System: Tab moi voi Reset + Factory Reset
- Status: Hien thi threadVersion, ipaddr, datasetActive (da parse TLV)
- Status/TopNav: Symbol doi mau theo thread state

## Active Decisions & Considerations

### Validation Strategy (confirmed)
Frontend chi check "khong trong" — backend xu ly moi validation chi tiet. Khong duplicate validation logic.

### CMD_SET_CHANNEL Data Format (confirmed)
Channel la `uint8_t` (1 byte), khong phai 3 byte. Range 11-26. Constant trong `shared/src/constants.ts`.

### leaderRloc16 Source
Lay tu CMD_IP_ADDR ACK (16-byte IPv6), byte 14-15 big-endian → format "0xXXXX". Luu trong `OtConfig.leaderRloc16`.

### Table Log Filtering
ROUTER_TABLE, CHILD_TABLE, JOINER_TABLE TX va ACK bi filter ra khoi console log (giu lai trong log file neu co). Giam noise.

## Next Steps (theo thu tu uu tien)

1. **CMD_DATA (CBOR)** — xu ly firmware push data, parse CBOR, route den handler tuong ung
2. **Shortcut commands** — nut nhanh trong Console tab
3. **Command history** — localStorage
4. **Live terminal** — hien thi raw UART bytes
5. **Security** — auth WS, HTTPS (neu can)

## Files to Watch

- `backend/src/communicate/CommunicateManager.ts` — logic chinh
- `backend/src/communicate/CommandManager.ts` — frame handling
- `shared/src/events.ts` — them event moi phai cap nhat day
- `shared/src/types.ts` — them field moi vao OtConfig phai cap nhat day
- `memory-bank/progress.md` — cap nhat khi hoan thanh task
