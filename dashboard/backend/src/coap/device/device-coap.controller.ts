/**
 * CoAP controller for /device/* (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state).
 * Devices identified by mac_address (key 0 in all payloads). Slug is backend-only.
 */

import type { CoapRequest, CoapResponse, CoapStatusValue } from "../core/coap.type";
import { CoapStatus } from "../core/coap.type";
import { sendCoapResponse } from "../core/coap.response";
import { CoapGet, CoapPost, ParseCborOrSend } from "../core/coap.decorator";
import { logger } from "@utils/logger.util";
import { formatMacForLog, formatRloc16ForLog } from "@utils/format.util";
import type { DeviceInfoPayload } from "./device.payload";
import {
  getPayloadField,
  roleToString,
  DEVICE_INFO_KEYS,
  PAYLOAD_KEY_MAC,
  PAYLOAD_KEY_ARRAY,
  TOPOLOGY_KEYS,
} from "./device.payload";
import { cborEncode } from "@cbor";
import { updateDeviceLastSeen } from "@database/repositories/device.repository";
import {
  upsertDeviceInfo,
  updateDeviceInfo,
  upsertTopology,
  mergeEntity,
  updateEntityDefinition,
  upsertEntityState,
  type EntityRestoreItem,
} from "./device-coap.service";

/** CBOR key for restore array in POST /device/register/entity response (align with request key 1 = entities). */
const CBOR_KEY_RESTORE = 10;

/** Restore item CBOR keys (integer keys for Thread-Node). */
const RESTORE_KEYS = {
  ENTITY_ID: 0,
  RESTORE_MODE: 1,
  STATE: 2,
  BRIGHTNESS: 3,
  MODE: 4,
  RGB_JSON: 5,
  COLOR_TEMP: 6,
  VALUE_REAL: 7,
  HAS_SAVED_STATE: 8,
} as const;

function buildRestoreCborMap(restore: EntityRestoreItem[]): Record<number, unknown> {
  const arr = restore.map((item) => ({
    [RESTORE_KEYS.ENTITY_ID]: item.entity_id,
    [RESTORE_KEYS.RESTORE_MODE]: item.restore_mode,
    [RESTORE_KEYS.STATE]: item.state,
    [RESTORE_KEYS.BRIGHTNESS]: item.brightness,
    [RESTORE_KEYS.MODE]: item.mode,
    [RESTORE_KEYS.RGB_JSON]: item.rgb_json,
    [RESTORE_KEYS.COLOR_TEMP]: item.color_temp,
    [RESTORE_KEYS.VALUE_REAL]: item.value_real,
    [RESTORE_KEYS.HAS_SAVED_STATE]: item.has_saved_state ? 1 : 0,
  }));
  return { [CBOR_KEY_RESTORE]: arr };
}

const coapLog = logger.child("CoAP");

/** Timestamp when server started; restart = new value so node re-registers. */
const serverStartTimestamp = (Math.floor(Date.now() / 1000) >>> 0) & 0xffffffff;

/** Normalize and validate mac from query (16-char hex). Returns null if invalid. */
function parsePingMac(url: string | undefined): string | null {
  if (!url) return null;
  let mac: string;
  try {
    mac = new URL(url, "coap://localhost").searchParams.get("mac") ?? "";
  } catch {
    return null;
  }
  mac = mac.trim().toLowerCase().replace(/^0x/, "");
  if (mac.length !== 16 || !/^[0-9a-f]+$/.test(mac)) return null;
  return mac;
}

export class DeviceCoapController {
  @CoapGet("/device/ping")
  ping(req: CoapRequest, res: CoapResponse): void {
    const mac = parsePingMac(req.url);
    if (mac !== null) updateDeviceLastSeen(mac);
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(serverStartTimestamp, 0);
    sendCoapResponse(req, res, CoapStatus.CONTENT, buf);
  }

  @ParseCborOrSend(CoapStatus.CREATED)
  @CoapPost("/device/register/info")
  registerInfo(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    if (Object.prototype.hasOwnProperty.call(parsed, "9")) {
      delete (parsed as Record<string, unknown>)["9"];
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "1") && Array.isArray(parsed["1"])) {
      delete (parsed as Record<string, unknown>)["1"];
    }
    const payload = parsed as unknown as DeviceInfoPayload;
    const mac = getPayloadField<unknown>(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS);
    const deviceName = getPayloadField<string>(parsed, DEVICE_INFO_KEYS.DEVICE_NAME);
    const deviceType = getPayloadField<number>(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE);
    coapLog.info(
      `CoAP /device/register/info: mac=${formatMacForLog(mac)} device_name=${deviceName ?? "-"} device_type=${deviceType ?? "-"}`
    );

    let status: CoapStatusValue = CoapStatus.CREATED;
    try {
      const result = upsertDeviceInfo(payload as unknown as Record<string, unknown>);
      status = result === "created" ? CoapStatus.CREATED : CoapStatus.CHANGED;
    } catch (e) {
      coapLog.warn(`CoAP /device/register/info failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, status);
  }

  @ParseCborOrSend(CoapStatus.CHANGED)
  @CoapPost("/device/register/entity")
  registerEntity(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    const arr = getPayloadField<unknown[]>(parsed, PAYLOAD_KEY_ARRAY);
    const count = Array.isArray(arr) ? arr.length : 0;
    const mac = getPayloadField<unknown>(parsed, PAYLOAD_KEY_MAC);
    coapLog.info(`CoAP /device/register/entity: mac=${formatMacForLog(mac)} entities=${count}`);

    let status: CoapStatusValue = CoapStatus.CHANGED;
    let restorePayload: Buffer | undefined;
    try {
      const { status: s, restore } = mergeEntity(parsed);
      status = s === "created" ? CoapStatus.CREATED : CoapStatus.CHANGED;
      if (restore.length > 0) {
        const cborMap = buildRestoreCborMap(restore);
        restorePayload = Buffer.from(cborEncode(cborMap));
      }
    } catch (e) {
      coapLog.warn(`CoAP /device/register/entity failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (restorePayload != null && restorePayload.length > 0) {
      sendCoapResponse(req, res, status, restorePayload, "application/cbor");
    } else {
      sendCoapResponse(req, res, status);
    }
  }

  @ParseCborOrSend(CoapStatus.CREATED)
  @CoapPost("/device/update/info")
  updateInfo(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    try {
      updateDeviceInfo(parsed as unknown as Record<string, unknown>);
    } catch (e) {
      coapLog.warn(`CoAP /device/update/info failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, CoapStatus.CHANGED);
  }

  @ParseCborOrSend(CoapStatus.CHANGED)
  @CoapPost("/device/update/entity")
  updateEntity(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    try {
      updateEntityDefinition(parsed);
    } catch (e) {
      coapLog.warn(`CoAP /device/update/entity failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, CoapStatus.CHANGED);
  }

  @ParseCborOrSend(CoapStatus.CHANGED)
  @CoapPost("/device/update/topology")
  updateTopology(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    const mac = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.MAC_ADDRESS);
    const rloc16 = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.RLOC16);
    const role = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.ROLE);
    coapLog.info(`CoAP /device/update/topology: mac=${formatMacForLog(mac)} rloc16=${formatRloc16ForLog(rloc16)} role=${roleToString(role)}`);
    try {
      upsertTopology(parsed);
    } catch (e) {
      coapLog.warn(`CoAP /device/update/topology failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, CoapStatus.CHANGED);
  }

  @ParseCborOrSend(CoapStatus.CHANGED)
  @CoapPost("/device/update/state")
  updateState(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    try {
      upsertEntityState(parsed);
    } catch (e) {
      coapLog.warn(`CoAP /device/update/state failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, CoapStatus.CHANGED);
  }
}
