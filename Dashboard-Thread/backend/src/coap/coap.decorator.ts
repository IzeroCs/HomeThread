/**
 * CoAP route decorators: @CoapGet(path), @CoapPost(path), etc.
 */

import { appendCoapRoute } from "./coap.type";

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
