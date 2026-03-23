/**
 * WebSocket event decorator: @WsOn(event) — đăng ký method làm handler cho event từ client.
 * Tương tự CoAP @CoapGet/@CoapPost; tại runtime getWsRoutes(WebSocketServer) để socket.on(event, handler).
 */

import { appendWsRoute } from "./ws.type";

/**
 * Method decorator: đăng ký handler cho event. Handler được gọi với (socket, data?) khi client emit(event, data).
 */
export function WsOn(event: string) {
  return function (
    _target: object,
    propertyKey: string
  ): void {
    appendWsRoute(_target.constructor as new (...args: unknown[]) => unknown, {
      event,
      propertyKey,
    });
  };
}
