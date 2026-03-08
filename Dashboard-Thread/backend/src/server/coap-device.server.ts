/**
 * CoAP server for Thread-Node (router, child, any role). Listens on UDP 5683.
 * Resources: GET /device/ping (2.05, 4-byte timestamp LE); POST /device/register, update (CBOR, 2.01).
 */

import * as coap from "coap";
import { cborDecode } from "../cbor";
import { logger } from "../utils/logger.util";
import {
  asDeviceRegisterPayload,
  getPayloadField,
  getRloc16,
  roleToString,
  DEVICE_REGISTER_KEYS,
  NETWORK_KEYS,
} from "./device-register.payload";

const coapLog = logger.child("CoAP");

const COAP_PORT = 5683;

/** Path prefix for device resources */
const DEVICE_PATH_PREFIX = "/device/";

export function startCoapDeviceServer(): coap.Server {
  const server = coap.createServer({ type: "udp6" });

  /** Timestamp khi khởi tạo server; restart = giá trị mới → node biết gửi lại /device/register */
  const serverStartTimestamp = (Math.floor(Date.now() / 1000) >>> 0) & 0xffffffff;

  server.on("request", (req: coap.IncomingMessage, res: coap.OutgoingMessage) => {
    const url = req.url ?? "";
    const method = (req as { method?: string }).method ?? "POST";
    coapLog.info(`CoAP request ${method} ${url}`);
    console.log('Source IP:', req.rsinfo.address);
    console.log('Source Port:', req.rsinfo.port);

    if (!url.startsWith(DEVICE_PATH_PREFIX)) {
      coapLog.warn(`CoAP path not accepted: ${url} (expected /device/...)`);
      res.statusCode = "4.04";
      res.end();
      return;
    }

    const pathPart = url.slice(DEVICE_PATH_PREFIX.length).replace(/\/$/, "") || "";
    const type = pathPart || "unknown";

    if (pathPart === "ping" && method === "GET") {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(serverStartTimestamp, 0);
      res.statusCode = "2.05";
      res.end(buf);
      coapLog.info(`CoAP GET /device/ping -> 2.05 timestamp=${serverStartTimestamp}`);
      return;
    }

    let parsed: Record<string, unknown> | null = null;
    const payload = req.payload;
    if (payload && payload.length > 0) {
      try {
        const decoded = cborDecode(new Uint8Array(payload));
        if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
          parsed = decoded as Record<string, unknown>;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const offset = (err as { offset?: number }).offset;
        coapLog.warn(`CoAP CBOR decode failed: ${url} - ${msg}${offset != null ? ` (offset ${offset})` : ""}`);
      }
    }

    const registerPayload = asDeviceRegisterPayload(parsed);
    const rloc16 = registerPayload ? getRloc16(registerPayload) : "-";

    if (parsed != null) {
      coapLog.info(`CoAP CBOR -> JSON: ${JSON.stringify(parsed)}`);
      if (registerPayload && type === "register") {
        const deviceId = getPayloadField<string>(parsed, DEVICE_REGISTER_KEYS.DEVICE_ID);
        const deviceName = getPayloadField<string>(parsed, DEVICE_REGISTER_KEYS.DEVICE_NAME);
        const deviceType = getPayloadField<number>(parsed, DEVICE_REGISTER_KEYS.DEVICE_TYPE);
        const network = getPayloadField<Record<string, unknown>>(parsed, DEVICE_REGISTER_KEYS.NETWORK);
        const role = network ? (network[String(NETWORK_KEYS.ROLE)] ?? network[NETWORK_KEYS.ROLE]) : undefined;
        const entities = getPayloadField<unknown[]>(parsed, DEVICE_REGISTER_KEYS.ENTITIES);
        coapLog.info(
          `CoAP /device/register structure: device_id=${deviceId ?? "-"} device_name=${deviceName ?? "-"} ` +
            `device_type=${deviceType ?? "-"} rloc16=${rloc16} role=${roleToString(role)} entities=${entities?.length ?? 0}`
        );
      }
    }

    coapLog.info(`CoAP ${url} -> 2.01 type=${type} rloc16=${rloc16}`);
    res.statusCode = "2.01";
    res.end();
  });

  server.listen(COAP_PORT, "::", () => {
    coapLog.info(`CoAP device server listening on [::]:${COAP_PORT} (path /device/...)`);
  });

  return server;
}
