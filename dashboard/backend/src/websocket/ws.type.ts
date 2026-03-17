/**
 * WebSocket route metadata — dùng cho decorator @WsOn(event).
 * Lưu danh sách (event → method name) trên constructor, tương tự CoAP getCoapRoutes/appendCoapRoute.
 */

export interface WsRoute {
  event: string;
  propertyKey: string;
}

const WS_ROUTES_KEY = Symbol("ws:routes");

export function getWsRoutes(ctor: new (...args: unknown[]) => unknown): WsRoute[] {
  return (ctor as unknown as { [WS_ROUTES_KEY]?: WsRoute[] })[WS_ROUTES_KEY] ?? [];
}

function setWsRoutes(ctor: new (...args: unknown[]) => unknown, routes: WsRoute[]): void {
  (ctor as unknown as { [WS_ROUTES_KEY]: WsRoute[] })[WS_ROUTES_KEY] = routes;
}

export function appendWsRoute(
  ctor: new (...args: unknown[]) => unknown,
  route: WsRoute
): void {
  const routes = getWsRoutes(ctor);
  routes.push(route);
  setWsRoutes(ctor, routes);
}
