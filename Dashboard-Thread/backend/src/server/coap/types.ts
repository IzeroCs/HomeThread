/**
 * CoAP request/response types for decorator-based handlers.
 */

import type { IncomingMessage, OutgoingMessage } from "coap";

export type CoapRequest = IncomingMessage;
export type CoapResponse = OutgoingMessage;

export type CoapHandler = (
  req: CoapRequest,
  res: CoapResponse
) => void | Promise<void>;

export interface CoapRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  propertyKey: string;
}

const COAP_ROUTES_KEY = Symbol("coap:routes");

export function getCoapRoutes(ctor: new (...args: unknown[]) => unknown): CoapRoute[] {
  return (ctor as unknown as { [COAP_ROUTES_KEY]?: CoapRoute[] })[COAP_ROUTES_KEY] ?? [];
}

export function setCoapRoutes(ctor: new (...args: unknown[]) => unknown, routes: CoapRoute[]): void {
  (ctor as unknown as { [COAP_ROUTES_KEY]: CoapRoute[] })[COAP_ROUTES_KEY] = routes;
}

export function appendCoapRoute(
  ctor: new (...args: unknown[]) => unknown,
  route: CoapRoute
): void {
  const routes = getCoapRoutes(ctor);
  routes.push(route);
  setCoapRoutes(ctor, routes);
}
