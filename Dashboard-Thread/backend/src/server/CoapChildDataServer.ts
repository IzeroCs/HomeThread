/**
 * CoAP server for child data (Thread-Node). Listens on UDP 5683.
 * Child sends full CBOR payload; we parse, then emit only subset to frontend.
 */

import * as coap from "coap";
import { decode } from "cbor2";
import { EVENTS } from "shared";
import type { ChildDataPayload } from "shared";
import { logger } from "../utils/logger";

const coapLog = logger.child("CoAP");

const COAP_PORT = 5683;

/** Path prefix for child resources */
const CHILD_PATH_PREFIX = "/child/";

type EmitFn = (event: string, data: unknown) => void;

/**
 * Map parsed CBOR (numeric keys: 0=type, 1=rloc16, 2=..., 3=...) to payload for frontend (subset only).
 */
function toFrontendPayload(
  type: string,
  parsed: Record<string | number, unknown> | null,
  timestamp: string
): ChildDataPayload {
  const rloc16 =
    parsed && (parsed[1] !== undefined || parsed["1"] !== undefined)
      ? String(parsed[1] ?? parsed["1"])
      : undefined;
  const summary = [type, rloc16].filter(Boolean).join(" ") || type;
  return {
    type,
    rloc16,
    timestamp,
    summary,
  };
}

export function startCoapChildDataServer(emit: EmitFn): coap.Server {
  const server = coap.createServer();

  server.on("request", (req: coap.IncomingMessage, res: coap.OutgoingMessage) => {
    const url = req.url ?? "";
    if (!url.startsWith(CHILD_PATH_PREFIX)) {
      res.statusCode = "4.04";
      res.end();
      return;
    }

    const pathPart = url.slice(CHILD_PATH_PREFIX.length).replace(/\/$/, "") || "";
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

    const payloadForFrontend = toFrontendPayload(type, parsed, timestamp);
    emit(EVENTS.CHILD_DATA, payloadForFrontend);
    res.statusCode = "2.01";
    res.end();
  });

  server.listen(COAP_PORT, () => {
    coapLog.info(`CoAP child data server listening on port ${COAP_PORT}`);
  });

  return server;
}
