/**
 * CoAP request/response types and status constants for decorator-based handlers.
 */

import type { IncomingMessage, OutgoingMessage } from "coap";

export type CoapRequest = IncomingMessage;
export type CoapResponse = OutgoingMessage;

/** CoAP response status (RFC 7252). */
export const CoapStatus = {
  CREATED: "2.01",
  CHANGED: "2.04",
  CONTENT: "2.05",
  NOT_FOUND: "4.04",
  SERVER_ERROR: "5.00",
} as const;

export type CoapStatusValue = (typeof CoapStatus)[keyof typeof CoapStatus];

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
