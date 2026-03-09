/**
 * CoAP controller for /device/* (ping, register, update, entities).
 * POST /device/register: CBOR keys 0–8 only (device + network); create/update device; echo token.
 * POST /device/entities: CBOR key 0 = device_id, key 9 = entities array; merge by (device_id, entity_id); echo token.
 */

import type { CoapRequest, CoapResponse } from "./coap.type";
import { CoapGet, CoapPost } from "./coap.decorator";
import { cborDecode } from "@cbor";
import { logger } from "@utils/logger.util";
import type { DeviceRegisterPayload } from "./device-register.payload";
import {
  getPayloadField,
  getRloc16,
  roleToString,
  DEVICE_REGISTER_KEYS,
  NETWORK_KEYS,
} from "./device-register.payload";
import { upsertDevice, mergeEntity } from "./device-coap.service";

const coapLog = logger.child("CoAP");

/** Timestamp khi khởi tạo; restart = giá trị mới → node biết gửi lại /device/register */
const serverStartTimestamp = (Math.floor(Date.now() / 1000) >>> 0) & 0xffffffff;

/** Echo CoAP token from request to response (RFC 7252) so Node can match and ACK. */
function echoCoapToken(req: CoapRequest, res: CoapResponse): void {
  const reqAny = req as unknown as Record<string, unknown>;
  const resAny = res as unknown as Record<string, unknown>;
  if (reqAny.token != null && typeof resAny.token !== "undefined") {
    resAny.token = reqAny.token;
  }
}

/** Get remote address string for device source_address (CoAP client). */
function getCoapSourceAddress(req: CoapRequest): string | null {
  const rsinfo = (req as unknown as Record<string, unknown>).rsinfo;
  if (rsinfo && typeof rsinfo === "object" && rsinfo !== null) {
    const addr = (rsinfo as Record<string, unknown>).address;
    const port = (rsinfo as Record<string, unknown>).port;
    if (addr != null) return port != null ? `${String(addr)}:${port}` : String(addr);
  }
  return null;
}

export class DeviceCoapController {
  @CoapGet("/device/ping")
  ping(req: CoapRequest, res: CoapResponse): void {
    echoCoapToken(req, res);
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(serverStartTimestamp, 0);
    res.statusCode = "2.05";
    res.end(buf);
  }

  @CoapPost("/device/register")
  register(req: CoapRequest, res: CoapResponse): void {
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

    // Chỉ dùng keys 0–8 (device + network); bỏ qua key 9 (entities).
    if (parsed != null && Object.prototype.hasOwnProperty.call(parsed, "9")) {
      const { "9": _entities, ...rest } = parsed;
      parsed = rest as Record<string, unknown>;
    }

    const rloc16 = parsed != null ? getRloc16(parsed as unknown as DeviceRegisterPayload) : "-";
    if (parsed != null) {
      const deviceId = getPayloadField<string>(parsed, DEVICE_REGISTER_KEYS.DEVICE_ID);
      const deviceName = getPayloadField<string>(parsed, DEVICE_REGISTER_KEYS.DEVICE_NAME);
      const deviceType = getPayloadField<number>(parsed, DEVICE_REGISTER_KEYS.DEVICE_TYPE);
      const network = getPayloadField<Record<string, unknown>>(parsed, DEVICE_REGISTER_KEYS.NETWORK);
      const role = network ? (network[String(NETWORK_KEYS.ROLE)] ?? network[NETWORK_KEYS.ROLE]) : undefined;
      coapLog.info(
        `CoAP /device/register: device_id=${deviceId ?? "-"} device_name=${deviceName ?? "-"} ` +
          `device_type=${deviceType ?? "-"} rloc16=${rloc16} role=${roleToString(role)}`
      );
    }

    let status: "2.01" | "2.04" | "2.05" = "2.01";
    if (parsed != null) {
      try {
        const sourceAddress = getCoapSourceAddress(req);
        const result = upsertDevice(parsed, sourceAddress);
        status = result === "created" ? "2.01" : "2.04";
      } catch (e) {
        coapLog.warn(`CoAP /device/register upsert failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    echoCoapToken(req, res);
    res.statusCode = status;
    res.end();
  }

  @CoapPost("/device/entities")
  entities(req: CoapRequest, res: CoapResponse): void {
    const url = req.url ?? "";
    let deviceId: string | null = null;
    let entitiesList: Record<string, unknown>[] = [];

    const payload = req.payload;
    if (payload && payload.length > 0) {
      try {
        const decoded = cborDecode(new Uint8Array(payload));
        if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
          const parsed = decoded as Record<string, unknown>;
          deviceId = getPayloadField<string>(parsed, DEVICE_REGISTER_KEYS.DEVICE_ID) ?? null;
          const arr = getPayloadField<unknown[]>(parsed, DEVICE_REGISTER_KEYS.ENTITIES);
          if (Array.isArray(arr)) {
            entitiesList = arr.filter(
              (e): e is Record<string, unknown> =>
                e !== null && typeof e === "object" && !Array.isArray(e)
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        coapLog.warn(`CoAP CBOR decode failed: ${url} - ${msg}`);
      }
    }

    coapLog.info(`CoAP /device/entities: device_id=${deviceId ?? "-"} entities=${entitiesList.length}`);

    let status: "2.01" | "2.04" | "2.05" = "2.04";
    if (deviceId) {
      let anyCreated = false;
      for (const entityMap of entitiesList) {
        try {
          const result = mergeEntity(deviceId, entityMap);
          if (result === "created") anyCreated = true;
        } catch (e) {
          coapLog.warn(`CoAP /device/entities merge failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      status = anyCreated ? "2.01" : "2.04";
    }

    echoCoapToken(req, res);
    res.statusCode = status;
    res.end();
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

    const rloc16 = parsed != null ? getRloc16(parsed as unknown as DeviceRegisterPayload) : "-";
    if (parsed != null) {
      coapLog.info(`CoAP CBOR -> JSON: ${JSON.stringify(parsed)}`);
    }

    echoCoapToken(req, res);
    res.statusCode = "2.01";
    coapLog.info(`CoAP ${url} -> 2.01 type=${type} rloc16=${rloc16}`);
    res.end();
  }
}
