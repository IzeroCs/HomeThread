# Active Context — Dashboard-Thread

## Current Work Focus

Project da on dinh voi BR qua TCP, trang Nodes (Router/Child/Joiner List), Toast dark theme, stable React keys. UI dark navy: Modal/ConfirmModal, System action cards, Sidebar settings icons. Tiep theo: bao tri, optional mDNS, security neu can.

## Recent Significant Changes

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

### Migration BR — Chi TCP, bo Serial (plan br_backend_communication)
- **Backend:** Loai bo hoan toan Serial/USB/UART. Chi dung **TransportTcp** ket noi BR (host:port). Cau hinh: **BrConnectionConfigService** (brHost, brPort, useMdns) luu SQLite; migration 005 tao bang `br_connection_config`. Xoa SerialPort.ts, SerialConfigService.ts; go dependency serialport.
- **CommunicateManager:** Chi TransportTcp + BrConnectionConfig; connectInternal(), onTransportDisconnected(), reconnect 3s. Status tra ve ConnectionStatus (isConnected, host, port).
- **WebSocketServer:** CONFIG_GET/SAVE/UPDATE payload brHost/brPort; handleBrTest(host, port); message loi "BR not connected".
- **Frontend:** BrConnectionForm (host + port, default Thread-Host.local:5000); Settings tab "BR Connection"; types BrConnectionConfigFromBackend, ConnectionStatus; useWebSocket saveConfig(brHost, brPort), testBrConnect. Navigation/Status/Commissioner/Console/Dashboard/SystemTab: message "BR" thay "Serial".
- **Docs:** migration_to_frame_protocol.md, README.md da cap nhat.

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
Lay tu CMD_IP_ADDR ACK (16-byte IPv6), byte 14-15 big-endian → format "0xXXXX". Luu trong `OtConfig.leaderRloc16`.

### Table Log Filtering
ROUTER_TABLE, CHILD_TABLE, JOINER_TABLE TX va ACK bi filter ra khoi console log (giu lai trong log file neu co). Giam noise.

## Next Steps (theo thu tu uu tien)

1. **mDNS browse** *(tuy chon)* — Backend browse `_thread-frame._tcp`, frontend nut "Tim BR (mDNS)"
2. **TCP keepalive** — Da co the bat de phat hien mat ket noi BR nhanh hon (backend TransportTcp)
3. **Security** *(neu can)* — auth WS, HTTPS

## Files to Watch

- `backend/src/communicate/CommunicateManager.ts`, `TransportTcp.ts`, `BrConnectionConfigService.ts`
- `backend/src/communicate/CommandManager.ts` — frame handling
- `frontend/src/components/Nodes/Nodes.tsx` — Router/Child table, JoinerList, CommissionNodeModal
- `frontend/src/components/Nodes/JoinerList.tsx` — joiner cards, countdown (snapshot + now)
- `frontend/src/components/common/ToastContainer.tsx` + `ToastContainer.scss` — toast dark
- `frontend/src/components/common/Modal.scss`, `ConfirmModal.scss` — dark navy theme
- `frontend/src/components/common/Sidebar.tsx` + `Sidebar.scss` — nav, Settings sub-items icons
- `frontend/src/components/Settings/SystemTab.tsx` + `SystemTab.scss` — action cards, danger divider
- `frontend/src/components/Settings/OpenThreadConfigForm.scss` — ot-card, footer layout
- `shared/src/events.ts`, `shared/src/types.ts` — thêm field/event cập nhật cả hai
- `memory-bank/progress.md` — cập nhật khi hoàn thành task
