/**
 * CoAP route decorators: @CoapGet(path), @CoapPost(path), etc.
 * @ParseCborOrSend(status): parse CBOR from body; if invalid/empty send status and skip handler; else call handler(req, res, parsed).
 */

import { appendCoapRoute, type CoapRequest, type CoapResponse, type CoapStatusValue } from "./coap.type";
import { sendCoapResponse } from "./coap.response";
import { cborDecode } from "@cbor";

function parseCborPayload(payload: Buffer | undefined): Record<string, unknown> | null {
  if (!payload || payload.length === 0) return null;
  try {
    const decoded = cborDecode(new Uint8Array(payload));
    if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
      return decoded as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Method decorator: parse CBOR from req.payload. If invalid/empty, send given status and do not call handler.
 * Otherwise call original handler with (req, res, parsed).
 */
export function ParseCborOrSend(status: CoapStatusValue) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (
      this: object,
      req: CoapRequest,
      res: CoapResponse,
      parsed: Record<string, unknown>
    ) => void | Promise<void>;
    descriptor.value = function (this: object, req: CoapRequest, res: CoapResponse): void | Promise<void> {
      const parsed = parseCborPayload((req as { payload?: Buffer }).payload);
      if (parsed == null) {
        sendCoapResponse(req, res, status);
        return;
      }
      return original.call(this, req, res, parsed);
    };
    return descriptor;
  };
}

function createCoapMethodDecorator(method: "GET" | "POST" | "PUT" | "DELETE") {
  return function (path: string) {
    return function (
      target: object,
      propertyKey: string
    ): void {
      appendCoapRoute(target.constructor as new (...args: unknown[]) => unknown, {
        method,
        path: path.replace(/\/$/, "") || "/",
        propertyKey,
      });
    };
  };
}

export const CoapGet = createCoapMethodDecorator("GET");
export const CoapPost = createCoapMethodDecorator("POST");
export const CoapPut = createCoapMethodDecorator("PUT");
export const CoapDelete = createCoapMethodDecorator("DELETE");
