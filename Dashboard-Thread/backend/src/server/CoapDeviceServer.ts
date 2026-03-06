/**
 * CoAP server for Thread-Node (router, child, any role). Listens on UDP 5683.
 * Resources: /device/register, /device/update, /device/ping. Payload CBOR; parse and respond 2.01.
 */

import * as coap from "coap";
import { decode } from "cbor2";
import { logger } from "../utils/logger";

const coapLog = logger.child("CoAP");

const COAP_PORT = 5683;

/** Path prefix for device resources */
const DEVICE_PATH_PREFIX = "/device/";

export function startCoapDeviceServer(): coap.Server {
  const server = coap.createServer({ type: "udp6" });

  server.on("request", (req: coap.IncomingMessage, res: coap.OutgoingMessage) => {
    const url = req.url ?? "";
    const method = (req as { method?: string }).method ?? "POST";
    coapLog.info(`CoAP request ${method} ${url}`);

    if (!url.startsWith(DEVICE_PATH_PREFIX)) {
      coapLog.warn(`CoAP path not accepted: ${url} (expected /device/...)`);
      res.statusCode = "4.04";
      res.end();
      return;
    }

    const pathPart = url.slice(DEVICE_PATH_PREFIX.length).replace(/\/$/, "") || "";
    const type = pathPart || "unknown";
    const timestamp = new Date().toISOString();

    let parsed: Record<string | number, unknown> | null = null;
    const payload = req.payload;
    if (payload && payload.length > 0) {
      try {
        const decoded = decode(new Uint8Array(payload));
        if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
          parsed = decoded as Record<string | number, unknown>;
        }
      } catch (err) {
        coapLog.warn(`CoAP CBOR decode failed: ${url}`, err);
      }
    }

    if (parsed != null) {
      coapLog.info(`CoAP CBOR -> JSON: ${JSON.stringify(parsed)}`);
    }

    const rloc16 =
      parsed && (parsed[1] !== undefined || parsed["1"] !== undefined)
        ? String(parsed[1] ?? parsed["1"])
        : "-";
    coapLog.info(`CoAP ${url} -> 2.01 type=${type} rloc16=${rloc16}`);
    res.statusCode = "2.01";
    res.end();
  });

  server.listen(COAP_PORT, "::", () => {
    coapLog.info(`CoAP device server listening on [::]:${COAP_PORT} (path /device/...)`);
  });

  return server;
}
