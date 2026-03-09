/**
 * CoAP server for Thread-Node (router, child, any role). Listens on UDP 5683.
 * Routes: GET /device/ping (2.05, 4-byte timestamp LE, echo token);
 * POST /device/register (CBOR keys 0–8 only, 2.01/2.04, echo token);
 * POST /device/entities (CBOR key 0 + key 9 array, merge by device_id+entity_id, 2.01/2.04, echo token);
 * POST /device/update (legacy CBOR, 2.01, echo token).
 * Uses decorator-based controllers (@CoapGet, @CoapPost).
 */

import * as coap from "coap";
import { logger } from "@utils/logger.util";
import { registerCoapControllers, DeviceCoapController } from "./index";

const coapLog = logger.child("CoAP");
const COAP_PORT = 5683;

export function startCoapDeviceServer(): coap.Server {
  const server = coap.createServer({ type: "udp6" });
  registerCoapControllers(server, [DeviceCoapController]);

  server.listen(COAP_PORT, "::", () => {
    coapLog.info(`CoAP device server listening on [::]:${COAP_PORT} (path /device/...)`);
  });

  return server;
}
