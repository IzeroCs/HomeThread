/**
 * Drizzle schema - SQLite (better-sqlite3).
 * Single source of truth for tables; migrations run from generated/kept SQL.
 */

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";

/** App settings key/value + BR config (br_host, br_port, use_mdns). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** CoAP device register/info — key by mac_address. */
export const deviceInfo = sqliteTable("device_info", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  macAddress: text("mac_address").notNull().unique(),
  deviceSlug: text("device_slug").unique(),
  deviceName: text("device_name"),
  deviceNameRaw: text("device_name_raw"),
  deviceType: integer("device_type"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  swVersion: integer("sw_version"),
  hwVersion: integer("hw_version"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

/** One row per device (device_id = device_info.id). */
export const deviceTopology = sqliteTable(
  "device_topology",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: integer("device_id").notNull(),
    rloc16: text("rloc16"),
    parentRloc16: text("parent_rloc16"),
    role: integer("role"),
    rssi: integer("rssi"),
    linkQuality: integer("link_quality"),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [unique("device_topology_device_id_unique").on(t.deviceId)]
);

export const deviceTopologyHistory = sqliteTable("device_topology_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull(),
  rloc16: text("rloc16"),
  parentRloc16: text("parent_rloc16"),
  role: integer("role"),
  rssi: integer("rssi"),
  linkQuality: integer("link_quality"),
  recordedAt: text("recorded_at").default(sql`(CURRENT_TIMESTAMP)`),
});

/** CoAP register/entity — device_id = device_info.id. */
export const deviceEntity = sqliteTable(
  "device_entity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: integer("device_id").notNull(),
    entityId: text("entity_id").notNull(),
    name: text("name"),
    nameRaw: text("name_raw"),
    type: integer("type"),
    deviceClass: integer("device_class"),
    unit: text("unit"),
    attributesJson: text("attributes_json"),
    restoreMode: integer("restore_mode").default(0),
    disabled: integer("disabled").default(0),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [unique("device_entity_device_entity_id_unique").on(t.deviceId, t.entityId)]
);

/** One row per entity — entity_id = device_entity.id. */
export const deviceEntityState = sqliteTable("device_entity_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: integer("entity_id").notNull().unique(),
  state: integer("state"),
  brightness: integer("brightness"),
  mode: integer("mode"),
  rgbJson: text("rgb_json"),
  colorTemp: integer("color_temp"),
  valueReal: real("value_real"),
  deletedAt: text("deleted_at"),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const deviceEntityStateHistory = sqliteTable("device_entity_state_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: integer("entity_id").notNull(),
  state: integer("state"),
  brightness: integer("brightness"),
  mode: integer("mode"),
  rgbJson: text("rgb_json"),
  colorTemp: integer("color_temp"),
  valueReal: real("value_real"),
  recordedAt: text("recorded_at").default(sql`(CURRENT_TIMESTAMP)`),
});
