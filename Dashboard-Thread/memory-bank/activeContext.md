# Active Context — Dashboard-Thread

## Current Work Focus

Memory Bank vua duoc tao va cau truc lai theo chuan Cursor Memory Bank. Project hien tai da co day du tinh nang chinh; tap trung vao cac viec con lai trong TODO.

## Recent Significant Changes

### UI Redesign — Status + TopNav (SCSS only, no Tailwind)
- **Branding:** TopNav hien thi "ThreadDash"; nav: Status, Devices, Topology, Console, Settings; icon buttons: notifications, settings, account_circle.
- **Status page — Connected:** Card BR voi icon router (vung icon 1/3), badge "Connected (Đã kết nối)", Host Address, Uptime, nut Refresh; OpenThread Network grid 3x4 (can deu theo hang), label UPPERCASE, gia tri accent (Network Name, IP), badge "2.4 GHz" cho Channel, nut show/hide Network Key.
- **Status page — Disconnected:** Card BR compact: icon tron 48px do (link_off) + label "BR Connection Status" + "DISCONNECTED" + cham do pulse + nut Refresh. OpenThread: header "OpenThread Network" + "Snapshot: Last seen — ago"; ghost grid (opacity 0.4, blur); overlay card "No Network Data Available" + nut "Configure Border Router" (goi onConfigureBr → chuyen Settings). Khong dung Tailwind — chi SCSS.
- **Version:** Subtitle Status lay version tu `frontend/package.json` qua Vite `define __APP_VERSION__`; dong bo voi memory-bank/progress.md (1.0.0).

### Migration BR — Chi TCP, bo Serial (plan br_backend_communication)
- **Backend:** Loai bo hoan toan Serial/USB/UART. Chi dung **TransportTcp** ket noi BR (host:port). Cau hinh: **BrConnectionConfigService** (brHost, brPort, useMdns) luu SQLite; migration 005 tao bang `br_connection_config`. Xoa SerialPort.ts, SerialConfigService.ts; go dependency serialport.
- **CommunicateManager:** Chi TransportTcp + BrConnectionConfig; connectInternal(), onTransportDisconnected(), reconnect 3s. Status tra ve ConnectionStatus (isConnected, host, port).
- **WebSocketServer:** CONFIG_GET/SAVE/UPDATE payload brHost/brPort; handleBrTest(host, port); message loi "BR not connected".
- **Frontend:** BrConnectionForm (host + port, default Thread-Host.local:5000); Settings tab "BR Connection"; types BrConnectionConfigFromBackend, ConnectionStatus; useWebSocket saveConfig(brHost, brPort), testBrConnect. TopNav/Status/Commissioner/Console/Dashboard/SystemTab: message "BR" thay "Serial".
- **Docs:** migration_to_frame_protocol.md, README.md da cap nhat.

### Documentation (truoc do)
- Tao `HomeThread/Documents/`, symlink docs, Memory Bank

### Backend (truoc do)
- shared/, CMD_*, leaderRloc16, auto-start Thread, filter log TABLE

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

1. **mDNS browse** *(tuy chon)* — Backend endpoint browse `_thread-frame._tcp`, frontend nut "Tim BR (mDNS)" chon instance
2. **CMD_DATA (CBOR)** — da bo (child gui thang backend); neu can xu ly push khac thi lam rieng
3. **Shortcut commands / Command history / Live terminal** — Console tab (neu can)
4. **Security** — auth WS, HTTPS (neu can)

## Files to Watch

- `backend/src/communicate/CommunicateManager.ts` — logic chinh (TransportTcp, BrConnectionConfig)
- `backend/src/communicate/CommandManager.ts` — frame handling
- `backend/src/communicate/TransportTcp.ts` — TCP client
- `backend/src/communicate/BrConnectionConfigService.ts` — config BR
- `shared/src/events.ts`, `shared/src/types.ts` — them field/event phai cap nhat day
- `memory-bank/progress.md` — cap nhat khi hoan thanh task
