# Dashboard Thread - TODO List

## Tổng quan dự án

Xây dựng Dashboard để quản lý và giám sát Thread network thông qua ot-daemon/ot-ctl trên ESP32-H2.

**Kiến trúc:**
```
ESP32-H2 (ot-rcp) 
    ↓ UART
Linux (ot-daemon) 
    ↓ UNIX Socket
Backend Server (Node.js + TypeScript)
    ↓ WebSocket
Frontend Dashboard (React + TypeScript + Vite)
```

---

## Phase 1: Monorepo Setup

### Root Configuration
- [x] Setup npm workspaces trong root `package.json`
- [x] Tạo root `tsconfig.json` với TypeScript project references
- [x] Setup `.vscode/settings.json` cho IDE indexing
- [x] Tạo `.vscode/extensions.json` với recommended extensions
- [ ] Verify IDE indexing hoạt động đúng (Go to Definition, IntelliSense)

---

## Phase 2: Backend Development

### 2.1 Backend Project Setup
- [x] Khởi tạo Node.js project với TypeScript
- [x] Cấu hình `tsconfig.json` với `composite: true`
- [x] Setup WebSocket server (Socket.io)
- [x] Cấu hình ESLint và Prettier
- [x] Setup environment variables (.env)
- [x] Tạo cấu trúc thư mục cơ bản
- [x] Tạo `src/server.ts` với WebSocket server
- [x] Tạo `src/types/messages.ts` với message types
- [x] Tạo `src/config/env.ts` và `src/config/logger.ts`

### 2.2 OT-CTL Wrapper Service
- [ ] Tạo `src/services/otCtlService.ts`
- [ ] Implement function để execute ot-ctl commands
  ```typescript
  executeCommand(command: string): Promise<string>
  ```
- [ ] Parse output từ ot-ctl commands
- [ ] Error handling cho failed commands
- [ ] Timeout handling cho long-running commands
- [ ] Caching mechanism (optional) cho frequently accessed data

**Commands cần implement:**
- [ ] `state` - Get device state
- [ ] `version` - Get OpenThread version
- [ ] `router list` - List routers
- [ ] `child list` - List child devices
- [ ] `neighbor list` - List neighbors
- [ ] `ipaddr` - Get IP addresses
- [ ] `networkname` - Get/set network name
- [ ] `channel` - Get/set channel
- [ ] `panid` - Get/set PAN ID
- [ ] `leaderdata` - Get leader data
- [ ] `netdatashow` - Show network data
- [ ] `ping` - Ping command
- [ ] `linkquality` - Get link quality

### 2.3 WebSocket Message Router
- [ ] Tạo message router trong `src/server.ts`:
  - [ ] Route message dựa trên `msg.type`
  - [ ] Call appropriate handler function
  - [ ] Handle errors và return response
- [ ] Message validation với Zod:
  - [ ] Request message schema
  - [ ] Response message schema
  - [ ] Event message schema

### 2.4 WebSocket Message Handlers
- [ ] Tạo handler files trong `src/handlers/`
- [ ] Device Handlers (`src/handlers/device.ts`):
  - [ ] `device:getState` - Get device state
  - [ ] `device:getVersion` - Get version
  - [ ] `device:reset` - Reset device
- [ ] Network Handlers (`src/handlers/network.ts`):
  - [ ] `network:getInfo` - Get network info
  - [ ] `network:getName` - Get network name
  - [ ] `network:setName` - Set network name
  - [ ] `network:getChannel` - Get channel
  - [ ] `network:setChannel` - Set channel
  - [ ] `network:getPanId` - Get PAN ID
  - [ ] `network:setPanId` - Set PAN ID
- [ ] Topology Handlers (`src/handlers/topology.ts`):
  - [ ] `topology:getRouters` - Get router list
  - [ ] `topology:getChildren` - Get child list
  - [ ] `topology:getNeighbors` - Get neighbor list
- [ ] Address Handlers (`src/handlers/addresses.ts`):
  - [ ] `addresses:getIp` - Get IP addresses
  - [ ] `addresses:getRloc16` - Get RLOC16
  - [ ] `addresses:getEui64` - Get EUI64
- [ ] Diagnostics Handlers (`src/handlers/diagnostics.ts`):
  - [ ] `diagnostics:getLeaderData` - Get leader data
  - [ ] `diagnostics:getLinkQuality` - Get link quality
  - [ ] `diagnostics:ping` - Ping command

### 2.5 Event Broadcasting
- [ ] Implement event system để broadcast changes:
  - [ ] Device state changes
  - [ ] Network configuration changes
  - [ ] Topology updates (router/child/neighbor changes)
  - [ ] Connection status changes
- [ ] Periodic updates cho real-time monitoring:
  - [ ] Setup interval để poll ot-daemon state
  - [ ] Compare với previous state
  - [ ] Broadcast chỉ khi có thay đổi
- [ ] Event filtering (chỉ gửi khi có thay đổi)
- [ ] Event queue để handle multiple events

### 2.6 Backend Error Handling & Validation
- [x] WebSocket error handler
- [ ] Message validation với Zod
- [x] Response formatting (success/error messages)
- [x] Logging setup (Winston)
- [ ] Timeout handling cho long-running commands
- [ ] Retry logic cho failed ot-ctl commands

### 2.7 Backend Testing
- [ ] Setup Jest testing framework
- [ ] Unit tests cho `otCtlService.ts`
- [ ] Unit tests cho message handlers
- [ ] Integration tests cho WebSocket communication
- [ ] Mock ot-ctl responses cho testing
- [ ] Error scenario testing

### 2.8 Backend Production Configuration
- [ ] Environment configuration
- [ ] Logging configuration
- [ ] Health check endpoint (nếu cần)
- [ ] Process manager (PM2 hoặc systemd)
- [ ] Production build optimization

---

## Phase 3: Frontend Development

### 3.1 Frontend Project Setup
- [x] Khởi tạo React project với Vite + TypeScript
- [x] Cấu hình `tsconfig.json` với `composite: true`
- [x] Cấu hình `vite.config.ts`
- [x] Setup ESLint và Prettier
- [x] Cấu hình environment variables
- [x] Setup WebSocket client (Socket.io client)
- [ ] Setup React Router (nếu cần multiple pages)
- [ ] Tạo cấu trúc thư mục đầy đủ

### 3.2 WebSocket Client Setup
- [ ] Tạo `src/services/websocket.ts`
- [ ] Setup WebSocket client (Socket.io client)
- [ ] Connection configuration:
  - [ ] URL từ environment variable
  - [ ] Port configuration
  - [ ] Auth token (nếu có)
- [ ] Connection state management:
  - [ ] `connected` - Connection status
  - [ ] `disconnected` - Disconnection status
  - [ ] `reconnecting` - Reconnection status
  - [ ] `error` - Error state
- [ ] Message type definitions trong `src/types/messages.ts`
- [ ] Request/Response pattern với correlation IDs:
  - [ ] Generate unique request IDs
  - [ ] Map requests to responses
  - [ ] Handle timeouts
- [ ] Error handling và reconnection logic:
  - [ ] Auto-reconnect on disconnect
  - [ ] Exponential backoff
  - [ ] Max retry attempts
  - [ ] Connection status callbacks

### 3.3 WebSocket Hooks
- [ ] Tạo `src/hooks/useWebSocket.ts`:
  - [ ] Connection management hook
  - [ ] Send message function
  - [ ] Listen to events
  - [ ] Connection state
- [ ] Tạo `src/hooks/useDeviceState.ts`:
  - [ ] Get device state
  - [ ] Auto-update từ WebSocket events
  - [ ] Loading/error states
- [ ] Tạo `src/hooks/useNetworkInfo.ts`:
  - [ ] Get network info
  - [ ] Auto-update từ WebSocket events
  - [ ] Update network settings
- [ ] Tạo `src/hooks/useTopology.ts`:
  - [ ] Get topology data (routers/children/neighbors)
  - [ ] Auto-update từ WebSocket events
  - [ ] Refresh function

### 3.4 Core Components

#### Layout Components
- [ ] Main Layout (`src/components/layout/MainLayout.tsx`):
  - [ ] Sidebar/Navbar
  - [ ] Header với connection status
  - [ ] Main content area
  - [ ] Footer (optional)
- [ ] Responsive design (mobile-friendly):
  - [ ] Mobile menu
  - [ ] Responsive grid layout
  - [ ] Touch-friendly buttons
- [ ] Theme support (light/dark mode - optional):
  - [ ] Theme toggle button
  - [ ] Theme context/provider
  - [ ] Persist theme preference

#### Device Status Components
- [ ] Device State Card (`src/components/device/DeviceStateCard.tsx`):
  - [ ] Display device state (detached/child/router/leader)
  - [ ] Visual indicator (color)
  - [ ] State description
- [ ] Version Info (`src/components/device/VersionInfo.tsx`):
  - [ ] OpenThread version display
  - [ ] Build info (nếu có)
- [ ] Connection Status (`src/components/device/ConnectionStatus.tsx`):
  - [ ] WebSocket connection indicator
  - [ ] Last update timestamp
  - [ ] Connection quality indicator

#### Network Information Components
- [ ] Network Name (`src/components/network/NetworkName.tsx`):
  - [ ] Display network name
  - [ ] Edit mode với input field
  - [ ] Save/Cancel buttons
- [ ] Channel Selector (`src/components/network/ChannelSelector.tsx`):
  - [ ] Display current channel
  - [ ] Channel selector dropdown
  - [ ] Update channel function
- [ ] PAN ID Display (`src/components/network/PanIdDisplay.tsx`):
  - [ ] Display PAN ID
  - [ ] Display Extended PAN ID
- [ ] Network Time (`src/components/network/NetworkTime.tsx`):
  - [ ] Display network time
  - [ ] Auto-update timer

#### Topology Components
- [ ] Router List (`src/components/topology/RouterList.tsx`):
  - [ ] Table/cards display
  - [ ] Router information (RLOC16, Link Quality, etc.)
  - [ ] Real-time updates từ WebSocket events
- [ ] Child Devices List (`src/components/topology/ChildList.tsx`):
  - [ ] Table/cards display
  - [ ] Child device information
  - [ ] Real-time updates
- [ ] Neighbor List (`src/components/topology/NeighborList.tsx`):
  - [ ] Table/cards display
  - [ ] Neighbor information
  - [ ] Real-time updates
- [ ] Network Graph (`src/components/topology/NetworkGraph.tsx`) - Optional:
  - [ ] Visual graph với D3.js hoặc vis.js
  - [ ] Interactive nodes
  - [ ] Real-time updates
  - [ ] Zoom/pan controls

#### Address Components
- [ ] IP Addresses List (`src/components/addresses/IpAddressList.tsx`):
  - [ ] Display all IP addresses
  - [ ] Address type (Link-local, Mesh-local, etc.)
  - [ ] Copy to clipboard functionality
- [ ] RLOC16 Display (`src/components/addresses/Rloc16Display.tsx`):
  - [ ] Display RLOC16
  - [ ] Format display
- [ ] EUI64 Display (`src/components/addresses/Eui64Display.tsx`):
  - [ ] Display EUI64
  - [ ] Copy to clipboard

#### Diagnostics Components
- [ ] Leader Data (`src/components/diagnostics/LeaderData.tsx`):
  - [ ] Display leader data
  - [ ] Format display
- [ ] Link Quality (`src/components/diagnostics/LinkQuality.tsx`):
  - [ ] Display link quality metrics
  - [ ] Visual indicators
- [ ] Ping Tool (`src/components/diagnostics/PingTool.tsx`):
  - [ ] Input field cho IP address
  - [ ] Ping button
  - [ ] Display ping results
  - [ ] Loading state
- [ ] Network Data Viewer (`src/components/diagnostics/NetworkDataViewer.tsx`):
  - [ ] Display network data
  - [ ] Expandable sections
  - [ ] JSON viewer (nếu cần)

### 3.5 Frontend State Management
- [ ] Setup state management (Context API hoặc Zustand):
  - [ ] Global WebSocket connection state
  - [ ] Device state cache
  - [ ] Network state cache
  - [ ] Topology state cache
- [ ] Actions:
  - [ ] Update device state
  - [ ] Update network state
  - [ ] Update topology state
  - [ ] Clear cache
- [ ] Event listeners cho real-time updates:
  - [ ] Device state change events
  - [ ] Network config change events
  - [ ] Topology update events
- [ ] Update store khi nhận events
- [ ] Optimistic updates cho write operations:
  - [ ] Update UI immediately
  - [ ] Rollback nếu có error

### 3.6 UI/UX Enhancements
- [ ] Loading states (skeletons/spinners):
  - [ ] Initial data loading
  - [ ] Refreshing data
  - [ ] Submitting forms
- [ ] Error states với retry buttons:
  - [ ] Connection errors
  - [ ] Request errors
  - [ ] Validation errors
- [ ] Toast notifications:
  - [ ] Success messages
  - [ ] Error messages
  - [ ] Info messages
- [ ] Form validation:
  - [ ] Network name validation
  - [ ] Channel validation
  - [ ] IP address validation (cho ping)
- [ ] Confirmation dialogs cho destructive actions
- [ ] Responsive design:
  - [ ] Responsive tables
  - [ ] Responsive cards
  - [ ] Touch-friendly buttons và inputs

### 3.7 Frontend Styling
- [ ] Chọn UI library:
  - Option 1: Material-UI (MUI)
  - Option 2: Ant Design
  - Option 3: Tailwind CSS + shadcn/ui
  - Option 4: Chakra UI
- [ ] Custom theme configuration
- [ ] Consistent color scheme
- [ ] Icon library (Material Icons, Lucide, etc.)
- [ ] Reusable components:
  - [ ] Button variants
  - [ ] Card components
  - [ ] Input components
  - [ ] Table components

### 3.8 Frontend Testing
- [ ] Setup Vitest + React Testing Library
- [ ] Component unit tests
- [ ] Hook tests
- [ ] WebSocket client service tests
- [ ] Mock WebSocket server cho testing
- [ ] Integration tests
- [ ] E2E tests (Playwright hoặc Cypress) - optional

### 3.9 Frontend Build & Production
- [ ] Production build configuration:
  - [ ] Optimize bundle size
  - [ ] Code splitting
  - [ ] Asset optimization
- [ ] Environment variables cho production
- [ ] Build scripts
- [ ] Production build testing

---

## Phase 4: Integration & Testing

### 4.1 Integration Testing
- [ ] Test với real ot-daemon instance
- [ ] Test các commands với ESP32-H2
- [ ] Test WebSocket communication end-to-end
- [ ] Performance testing
- [ ] Error recovery testing

### 4.2 Documentation
- [ ] README.md với setup instructions
- [ ] WebSocket protocol documentation:
  - [ ] Message types và structures
  - [ ] Request/Response pattern
  - [ ] Event types
  - [ ] Error handling
- [ ] Component documentation
- [ ] Deployment guide
- [ ] Troubleshooting guide:
  - [ ] Common issues
  - [ ] WebSocket connection troubleshooting
  - [ ] ot-ctl command issues

### 4.3 CI/CD (Optional)
- [ ] GitHub Actions workflow
- [ ] Automated testing
- [ ] Build and deploy automation

---

## Phase 5: Advanced Features (Future)

- [ ] Historical data logging
- [ ] Network statistics charts (Chart.js hoặc Recharts)
- [ ] Export data (CSV/JSON)
- [ ] Multi-device support (nếu có nhiều ESP32-H2)
- [ ] User authentication (WebSocket auth_token)
- [ ] Configuration backup/restore
- [ ] Network topology graph visualization với real-time updates
- [ ] Alert system cho network issues
- [ ] WebSocket message compression (nếu cần)

---

## Tech Stack Summary

### Backend
- **Runtime:** Node.js >= 20.0.0
- **Language:** TypeScript
- **WebSocket:** Socket.io
- **Process Management:** ot-ctl commands (child_process)
- **Validation:** Zod
- **Logging:** Winston
- **Testing:** Jest

### Frontend
- **Build Tool:** Vite
- **Framework:** React
- **Language:** TypeScript
- **WebSocket Client:** Socket.io client
- **State Management:** Context API hoặc Zustand
- **Routing:** React Router (nếu cần)
- **UI Library:** Material-UI / Ant Design / Tailwind CSS
- **Testing:** Vitest + React Testing Library

---

## Notes

### IDE Indexing & TypeScript
- **Monorepo Indexing**: IDE sẽ tự động index cả Backend và Frontend khi mở workspace ở root
- **TypeScript Project References**: Sử dụng để IDE hiểu dependencies giữa projects
- **Go to Definition**: Hoạt động across workspaces
- **IntelliSense**: Auto-complete và type checking hoạt động đúng
- **Nếu indexing không hoạt động**: 
  - Reload IDE window: `Cmd/Ctrl + Shift + P` → "Reload Window"
  - Restart TypeScript Server: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"
  - Đảm bảo đã chạy `npm install` ở root

### Development
- Đảm bảo ot-daemon đang chạy trước khi start backend
- Cần sudo permissions để chạy ot-ctl commands (hoặc config sudoers)
- WebSocket connection:
  - Port mặc định: 8080 (có thể config)
  - Cần handle reconnection logic
  - Consider connection timeout và heartbeat
- Security:
  - Validate all WebSocket messages
  - Consider authentication token (auth_token)
  - Rate limiting cho message frequency
- Performance:
  - Event filtering (chỉ broadcast khi có thay đổi)
  - Debouncing cho rapid updates
  - Connection pooling nếu có nhiều clients
- Error messages nên user-friendly và actionable
- Message protocol: Sử dụng JSON với type/action pattern
- **NO icons/emojis** trong log messages, labels, hoặc text output

### Running trong Monorepo

```bash
# Từ root directory (Dashboard-Thread/)
npm run dev              # Chạy cả backend và frontend
npm run dev:backend      # Chỉ chạy backend
npm run dev:frontend     # Chỉ chạy frontend
```

---

## Priority Order

1. **High Priority:** Phase 2.1-2.4, Phase 3.1-3.4
2. **Medium Priority:** Phase 2.5-2.8, Phase 3.5-3.9, Phase 4
3. **Low Priority:** Phase 5

---

*Last updated: 2026-02-13*
*Architecture: WebSocket-only (no HTTP/REST)*
