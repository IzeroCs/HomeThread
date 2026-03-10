/**
 * CoAP controller for /device/* (ping, register/info, register/entity, update/info, update/entity, update/topology, update/state).
 * Devices identified by mac_address (key 7). Slug is backend-only.
 */

import type { CoapRequest, CoapResponse, CoapStatusValue } from "../core/coap.type";
import { CoapStatus } from "../core/coap.type";
import { sendCoapResponse } from "../core/coap.response";
import { CoapGet, CoapPost, ParseCborOrSend } from "../core/coap.decorator";
import { logger } from "@utils/logger.util";
import type { DeviceInfoPayload } from "./device.payload";
import {
  getPayloadField,
  getRloc16FromTopologyPayload,
  roleToString,
  DEVICE_INFO_KEYS,
  TOPOLOGY_KEY,
  TOPOLOGY_KEYS,
  ENTITIES_KEY,
} from "./device.payload";
import { cborEncode } from "@cbor";
import {
  upsertDeviceInfo,
  updateDeviceInfo,
  upsertTopology,
  mergeEntity,
  updateEntityDefinition,
  upsertEntityState,
  type EntityRestoreItem,
} from "./device-coap.service";

/** CBOR key for restore array in POST /device/register/entity response (align with request key 9 = entities). */
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

export class DeviceCoapController {
  @CoapGet("/device/ping")
  ping(req: CoapRequest, res: CoapResponse): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(serverStartTimestamp, 0);
    sendCoapResponse(req, res, CoapStatus.CONTENT, buf);
  }

  @ParseCborOrSend(CoapStatus.CREATED)
  @CoapPost("/device/register/info")
  registerInfo(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    if (Object.prototype.hasOwnProperty.call(parsed, "9")) {
      const { "9": _e, ...rest } = parsed;
      Object.assign(parsed, rest);
      delete (parsed as Record<string, unknown>)["9"];
    }
    const payload = parsed as unknown as DeviceInfoPayload;
    const mac = getPayloadField<unknown>(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS);
    const deviceName = getPayloadField<string>(parsed, DEVICE_INFO_KEYS.DEVICE_NAME);
    const deviceType = getPayloadField<number>(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE);
    coapLog.info(
      `CoAP /device/register/info: mac=${mac ?? "-"} device_name=${deviceName ?? "-"} device_type=${deviceType ?? "-"}`
    );

    let status: CoapStatusValue = CoapStatus.CREATED;
    try {
      const result = upsertDeviceInfo(payload);
      status = result === "created" ? CoapStatus.CREATED : CoapStatus.CHANGED;
    } catch (e) {
      coapLog.warn(`CoAP /device/register/info failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    sendCoapResponse(req, res, status);
  }

  @ParseCborOrSend(CoapStatus.CHANGED)
  @CoapPost("/device/register/entity")
  registerEntity(req: CoapRequest, res: CoapResponse, parsed: Record<string, unknown>): void {
    const arr = getPayloadField<unknown[]>(parsed, ENTITIES_KEY);
    const count = Array.isArray(arr) ? arr.length : 0;
    const mac = getPayloadField<unknown>(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS);
    coapLog.info(`CoAP /device/register/entity: mac=${mac ?? "-"} entities=${count}`);

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
      updateDeviceInfo(parsed as unknown as DeviceInfoPayload);
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
    const rloc16 = getRloc16FromTopologyPayload(parsed);
    const topology = getPayloadField<Record<string, unknown>>(parsed, TOPOLOGY_KEY);
    const role = topology ? (topology[String(TOPOLOGY_KEYS.ROLE)] ?? topology[TOPOLOGY_KEYS.ROLE]) : undefined;
    const mac = getPayloadField<unknown>(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS);
    coapLog.info(`CoAP /device/update/topology: mac=${mac ?? "-"} rloc16=${rloc16} role=${roleToString(role)}`);
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
