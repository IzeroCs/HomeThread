/**
 * CoAP controller for /device/* (ping, register, update).
 */

import type { CoapRequest, CoapResponse } from "./coap.type";
import { CoapGet, CoapPost } from "./coap.decorator";
import { cborDecode } from "@cbor";
import { logger } from "@utils/logger.util";
import {
  asDeviceRegisterPayload,
  getPayloadField,
  getRloc16,
  roleToString,
  DEVICE_REGISTER_KEYS,
  NETWORK_KEYS,
} from "./device-register.payload";

const coapLog = logger.child("CoAP");

/** Timestamp khi khởi tạo; restart = giá trị mới → node biết gửi lại /device/register */
const serverStartTimestamp = (Math.floor(Date.now() / 1000) >>> 0) & 0xffffffff;

export class DeviceCoapController {
  @CoapGet("/device/ping")
  ping(_req: CoapRequest, res: CoapResponse): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(serverStartTimestamp, 0);
    res.statusCode = "2.05";
    res.end(buf);
  }

  @CoapPost("/device/register")
  register(req: CoapRequest, res: CoapResponse): void {
    this.handleDevicePost(req, res, "register");
  }

  @CoapPost("/device/update")
  update(req: CoapRequest, res: CoapResponse): void {
    this.handleDevicePost(req, res, "update");
  }

  private handleDevicePost(req: CoapRequest, res: CoapResponse, type: string): void {
    const url = req.url ?? "";

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
  }
}
