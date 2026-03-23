/**
 * CoAP response helpers: echo token, send status + optional body.
 */

import type { CoapRequest, CoapResponse, CoapStatusValue } from "./coap.type";
import { CoapStatus } from "./coap.type";

/** Echo CoAP token from request to response (RFC 7252). */
export function echoCoapToken(req: CoapRequest, res: CoapResponse): void {
  const reqAny = req as unknown as Record<string, unknown>;
  const resAny = res as unknown as Record<string, unknown>;
  if (reqAny.token != null && typeof resAny.token !== "undefined") {
    resAny.token = reqAny.token;
  }
}

/**
 * Send CoAP response: echo token, set status, optional Content-Format and body, then end.
 */
export function sendCoapResponse(
  req: CoapRequest,
  res: CoapResponse,
  status: CoapStatusValue,
  body?: Buffer,
  contentFormat?: string
): void {
  echoCoapToken(req, res);
  (res as { statusCode: string }).statusCode = status;
  if (contentFormat != null) {
    res.setOption("Content-Format", contentFormat);
  }
  res.end(body ?? undefined);
}

export { CoapStatus };
