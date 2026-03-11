# Backend WebSocket

WebSocket server relay events giữa frontend và backend (CommunicateManager, config, CoAP không dính). Event names dùng constant từ `shared/src/events.ts`.

---

## Cấu trúc

- **websocket.server.ts** — Entry: tạo Socket.IO server, khởi tạo 6 handler, trên mỗi connection đăng ký tất cả route từ handler.
- **ws.type.ts** — Metadata route: `WsRoute { event, propertyKey }`, `getWsRoutes(ctor)`, `appendWsRoute(ctor, route)` (Symbol-keyed trên constructor).
- **ws.decorator.ts** — `@WsOn(event)`: method decorator gọi `appendWsRoute` để đăng ký method làm handler cho event.
- **handler/** — Handlers tách theo domain; mỗi class nhận dependencies qua constructor.

---

## Handler Modules

| File | Class | Events |
|------|-------|--------|
| config.handler.ts | ConfigHandler | CONFIG_GET, CONFIG_SAVE, CONFIG_UPDATE |
| br.handler.ts | BrHandler | BR_STATUS, BR_CONNECT, BR_DISCONNECT, BR_TEST |
| device.handler.ts | DeviceHandler | DEVICE_RESET, DEVICE_FACTORY_RESET |
| thread.handler.ts | ThreadHandler | OT_GET_CONFIG, OT_SET_CONFIG, OT_GET_THREAD_STATE, OT_SET_THREAD_RUNNING, OT_START_THREAD, OT_STOP_THREAD, OT_GET_THREAD_RUN_ON_CONNECT, OT_SET_THREAD_RUN_ON_CONNECT, OT_GET_ROUTER_TABLE, OT_GET_CHILD_TABLE |
| commissioner.handler.ts | CommissionerHandler | COMMISSIONER_GET_JOINER_TABLE, COMMISSIONER_CONNECT |
| srp.handler.ts | SrpHandler | SRP_REGISTER |

---

## Luồng đăng ký

1. Constructor WebSocketServer: tạo instance từng handler (truyền `io`, `brConnectionConfigService`, `appSettingsService`, `communicate` theo nhu cầu).
2. Trên `io.on("connection", socket)`:
   - Gọi `configHandler.sendCurrentConfig(socket)`, `brHandler.sendBrStatus(socket)`.
   - Emit last thread state, OT config, router table, child table, joiner table từ communicate.
   - Với mỗi handler instance: `routes = getWsRoutes(handler.constructor)`, với mỗi `{ event, propertyKey }`: `socket.on(event, (data) => handler[propertyKey](socket, data))`.

---

## Thêm event mới

1. Thêm constant vào `shared/src/events.ts`.
2. Thêm method vào handler class phù hợp, đánh dấu `@WsOn(EVENTS.TEN_EVENT)`.
3. Không cần sửa `websocket.server.ts` — route tự lấy từ `getWsRoutes` khi load class.
