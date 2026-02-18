# IoT Entity Model - SQLite3 Database Schema

> **Version:** 1.0.0  
> **Date:** February 18, 2026  
> **Platform:** SQLite3 for Leader/Border Router

---

## Table of Contents

1. [Overview](#overview)
2. [Database Design Principles](#database-design-principles)
3. [Schema Diagram](#schema-diagram)
4. [Table Definitions](#table-definitions)
   - [devices](#devices)
   - [entities](#entities)
   - [entity_light](#entity_light)
   - [entity_switch](#entity_switch)
   - [entity_fan](#entity_fan)
   - [entity_sensor](#entity_sensor)
   - [entity_climate](#entity_climate)
   - [entity_binary_sensor](#entity_binary_sensor)
   - [sensor_history](#sensor_history)
   - [events](#events)
5. [SQL Schema](#sql-schema)
6. [Query Examples](#query-examples)
7. [C API Implementation](#c-api-implementation)
8. [Migration & Maintenance](#migration--maintenance)

---

## Overview

This document defines the SQLite3 database schema for storing and managing IoT device entities on the Thread network leader/border router.

### Use Cases

- **Device Registry**: Store all devices in the Thread network
- **Entity State Management**: Track current state of all entities
- **Historical Data**: Store sensor readings and state changes
- **Event Logging**: Record device events and state transitions
- **Query & Control**: Fast queries for device discovery and control

---

## Database Design Principles

### 1. Normalization
- **3NF (Third Normal Form)**: Eliminate redundancy
- **Separate tables** for each entity type
- **Foreign keys** to maintain referential integrity

### 2. Performance
- **Indexes** on frequently queried columns
- **Lightweight schema** for embedded systems
- **Optimized queries** for common operations

### 3. Extensibility
- Easy to add new entity types
- JSON fields for flexible metadata
- Version tracking for schema migrations

### 4. Data Integrity
- **NOT NULL** constraints on required fields
- **CHECK** constraints for value ranges
- **UNIQUE** constraints on identifiers
- **CASCADE** deletes for cleanup

---

## Schema Diagram

```
┌─────────────┐
│   devices   │
├─────────────┤
│ id (PK)     │
│ device_id   │◄──────────┐
│ device_name │           │
│ device_type │           │
│ ...         │           │
└─────────────┘           │
                          │ (FK)
                          │
┌─────────────────────────┼───────────────────────┐
│                         │                       │
┌─────────────┐    ┌──────┴──────┐    ┌──────────┴────────┐
│  entities   │    │sensor_history│   │      events       │
├─────────────┤    ├─────────────┤    ├───────────────────┤
│ id (PK)     │    │ id (PK)     │    │ id (PK)           │
│ device_id(FK)│   │ entity_id(FK)│   │ device_id (FK)    │
│ entity_id   │    │ value       │    │ event_type        │
│ entity_type │    │ timestamp   │    │ description       │
│ ...         │    └─────────────┘    │ timestamp         │
└──────┬──────┘                       └───────────────────┘
       │
       │ (FK)
       │
       ├──────────────────┬──────────────────┬──────────────────┐
       │                  │                  │                  │
┌──────┴──────┐  ┌────────┴─────┐  ┌─────────┴────┐  ┌────────┴──────┐
│entity_light │  │entity_switch │  │ entity_fan   │  │ entity_sensor │
├─────────────┤  ├──────────────┤  ├──────────────┤  ├───────────────┤
│ entity_id(PK)│ │ entity_id(PK)│  │ entity_id(PK)│  │ entity_id(PK) │
│ state       │  │ state        │  │ state        │  │ value         │
│ brightness  │  │ gang_states  │  │ speed        │  │ unit          │
│ ...         │  │ ...          │  │ ...          │  │ ...           │
└─────────────┘  └──────────────┘  └──────────────┘  └───────────────┘

       ├──────────────────┬──────────────────┐
       │                  │                  │
┌──────┴──────────┐  ┌────┴─────────────────┐
│ entity_climate  │  │ entity_binary_sensor │
├─────────────────┤  ├──────────────────────┤
│ entity_id (PK)  │  │ entity_id (PK)       │
│ mode            │  │ state                │
│ current_temp    │  │ last_triggered       │
│ target_temp     │  │ ...                  │
│ ...             │  │                      │
└─────────────────┘  └──────────────────────┘
```

---

## Table Definitions

### devices

Stores device-level information for all Thread network devices.

```sql
CREATE TABLE devices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL UNIQUE,           -- "living-room-001"
    device_name         TEXT NOT NULL,                  -- "Living Room Controller"
    device_type         TEXT NOT NULL,                  -- "light_controller"
    manufacturer        TEXT,
    model               TEXT,
    sw_version          TEXT,
    hw_version          TEXT,
    mac_address         TEXT UNIQUE,                    -- IEEE EUI-64
    ipv6_addr           TEXT,                           -- Thread IPv6
    rloc16              TEXT,                           -- Thread RLOC16
    role                TEXT,                           -- "leader", "router", "child"
    
    -- Metadata
    online              INTEGER NOT NULL DEFAULT 1,     -- 0=offline, 1=online
    last_seen           INTEGER NOT NULL,               -- Unix timestamp
    registered_at       INTEGER NOT NULL,               -- Unix timestamp
    updated_at          INTEGER NOT NULL,               -- Unix timestamp
    
    -- Optional JSON for extensibility
    metadata            TEXT,                           -- JSON: {"custom_field": "value"}
    
    -- Indexes
    CONSTRAINT check_online CHECK (online IN (0, 1))
);

CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_online ON devices(online);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
```

---

### entities

Master table for all entities across all devices.

```sql
CREATE TABLE entities (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL,                  -- FK to devices.device_id
    entity_id           TEXT NOT NULL,                  -- "light_1", "temp_sensor"
    name                TEXT NOT NULL,                  -- "Living Room Light"
    entity_type         TEXT NOT NULL,                  -- "light", "sensor", "switch"
    device_class        TEXT,                           -- "dimmable", "temperature"
    available           INTEGER NOT NULL DEFAULT 1,     -- 0=unavailable, 1=available
    last_update         INTEGER NOT NULL,               -- Unix timestamp
    
    -- Optional JSON for extensibility
    metadata            TEXT,                           -- JSON: additional attributes
    
    -- Constraints
    UNIQUE(device_id, entity_id),
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
    CONSTRAINT check_available CHECK (available IN (0, 1)),
    CONSTRAINT check_entity_type CHECK (
        entity_type IN ('light', 'switch', 'fan', 'sensor', 'climate', 'binary_sensor')
    )
);

CREATE INDEX idx_entities_device_id ON entities(device_id);
CREATE INDEX idx_entities_entity_type ON entities(entity_type);
CREATE INDEX idx_entities_available ON entities(available);
```

---

### entity_light

Light-specific attributes.

```sql
CREATE TABLE entity_light (
    entity_id           TEXT PRIMARY KEY,               -- FK to entities.entity_id
    device_id           TEXT NOT NULL,                  -- Denormalized for query speed
    
    -- State
    state               INTEGER NOT NULL DEFAULT 0,     -- 0=off, 1=on
    brightness          INTEGER DEFAULT 100,            -- 0-100%
    color_temp          INTEGER,                        -- 2700-6500K
    rgb_r               INTEGER,                        -- 0-255
    rgb_g               INTEGER,                        -- 0-255
    rgb_b               INTEGER,                        -- 0-255
    
    -- Capabilities
    mode                TEXT NOT NULL,                  -- "on_off", "dimmable", "rgb"
    min_brightness      INTEGER DEFAULT 1,
    max_brightness      INTEGER DEFAULT 100,
    min_color_temp      INTEGER DEFAULT 2700,
    max_color_temp      INTEGER DEFAULT 6500,
    
    -- Effects
    effect              TEXT DEFAULT 'none',            -- "none", "blink", "rainbow"
    transition_time     INTEGER DEFAULT 0,              -- seconds
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1)),
    CONSTRAINT check_brightness CHECK (brightness BETWEEN 0 AND 100),
    CONSTRAINT check_rgb CHECK (
        rgb_r BETWEEN 0 AND 255 AND
        rgb_g BETWEEN 0 AND 255 AND
        rgb_b BETWEEN 0 AND 255
    )
);

CREATE INDEX idx_entity_light_device_id ON entity_light(device_id);
CREATE INDEX idx_entity_light_state ON entity_light(state);
```

---

### entity_switch

Switch-specific attributes.

```sql
CREATE TABLE entity_switch (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    
    -- State
    state               INTEGER NOT NULL DEFAULT 0,     -- For toggle switch
    pressed             INTEGER DEFAULT 0,              -- For push button
    gang_states         TEXT,                           -- JSON array: "[1,0,1]"
    gang_count          INTEGER DEFAULT 1,              -- 1-4
    
    -- Config
    type                TEXT NOT NULL,                  -- "toggle", "push", "multi_gang"
    momentary           INTEGER DEFAULT 0,              -- 0=toggle, 1=momentary
    interlock           INTEGER DEFAULT 0,              -- 0=no, 1=yes
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1)),
    CONSTRAINT check_gang_count CHECK (gang_count BETWEEN 1 AND 4)
);

CREATE INDEX idx_entity_switch_device_id ON entity_switch(device_id);
```

---

### entity_fan

Fan-specific attributes.

```sql
CREATE TABLE entity_fan (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    
    -- State
    state               INTEGER NOT NULL DEFAULT 0,     -- 0=off, 1=on
    speed               INTEGER DEFAULT 0,              -- 0-100%
    mode                TEXT DEFAULT 'off',             -- "off", "low", "medium", "high", "auto"
    oscillation         INTEGER DEFAULT 0,              -- 0=off, 1=on
    direction           INTEGER DEFAULT 0,              -- 0-360°
    
    -- Capabilities
    speed_levels        INTEGER DEFAULT 3,              -- 3, 5, or 100
    supports_oscillation INTEGER DEFAULT 0,
    supports_direction  INTEGER DEFAULT 0,
    supports_timer      INTEGER DEFAULT 0,
    
    -- Timer
    timer_remaining     INTEGER DEFAULT 0,              -- Minutes
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1)),
    CONSTRAINT check_speed CHECK (speed BETWEEN 0 AND 100)
);

CREATE INDEX idx_entity_fan_device_id ON entity_fan(device_id);
```

---

### entity_sensor

Sensor-specific attributes.

```sql
CREATE TABLE entity_sensor (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    
    -- Value
    value               REAL NOT NULL,                  -- Current value
    unit                TEXT NOT NULL,                  -- "°C", "%", "ppm"
    sensor_class        TEXT NOT NULL,                  -- "temperature", "humidity"
    
    -- Statistics (calculated from sensor_history)
    min_value           REAL,                           -- Min in last 24h
    max_value           REAL,                           -- Max in last 24h
    avg_value           REAL,                           -- Average
    
    -- Config
    accuracy            REAL,                           -- ±0.5
    update_interval     INTEGER DEFAULT 30,             -- Seconds
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE
);

CREATE INDEX idx_entity_sensor_device_id ON entity_sensor(device_id);
CREATE INDEX idx_entity_sensor_class ON entity_sensor(sensor_class);
```

---

### entity_climate

Climate control (AC/heater) attributes.

```sql
CREATE TABLE entity_climate (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    
    -- State
    mode                TEXT NOT NULL DEFAULT 'off',    -- "off", "cool", "heat", "auto"
    current_temp        REAL,                           -- °C
    target_temp         REAL NOT NULL,                  -- °C
    current_humidity    INTEGER,                        -- %
    
    -- Control
    fan_speed           TEXT DEFAULT 'auto',            -- "auto", "low", "medium", "high"
    swing               INTEGER DEFAULT 0,              -- 0=off, 1=on
    eco_mode            INTEGER DEFAULT 0,
    turbo_mode          INTEGER DEFAULT 0,
    
    -- Capabilities
    min_temp            REAL DEFAULT 16.0,
    max_temp            REAL DEFAULT 30.0,
    supports_heat       INTEGER DEFAULT 0,
    supports_cool       INTEGER DEFAULT 1,
    supports_dry        INTEGER DEFAULT 0,
    supports_swing      INTEGER DEFAULT 0,
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_target_temp CHECK (target_temp BETWEEN 16 AND 35)
);

CREATE INDEX idx_entity_climate_device_id ON entity_climate(device_id);
```

---

### entity_binary_sensor

Binary sensor attributes.

```sql
CREATE TABLE entity_binary_sensor (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    
    -- State
    state               INTEGER NOT NULL DEFAULT 0,     -- 0=clear, 1=detected
    sensor_class        TEXT NOT NULL,                  -- "motion", "door", "smoke"
    
    -- Metadata
    last_triggered      INTEGER,                        -- Unix timestamp
    trigger_count       INTEGER DEFAULT 0,              -- Count in last 24h
    debounce_time       INTEGER DEFAULT 0,              -- Milliseconds
    
    -- Timestamp
    updated_at          INTEGER NOT NULL,
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1))
);

CREATE INDEX idx_entity_binary_sensor_device_id ON entity_binary_sensor(device_id);
CREATE INDEX idx_entity_binary_sensor_class ON entity_binary_sensor(sensor_class);
CREATE INDEX idx_entity_binary_sensor_state ON entity_binary_sensor(state);
```

---

### sensor_history

Historical sensor readings for analytics and statistics.

```sql
CREATE TABLE sensor_history (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id           TEXT NOT NULL,                  -- FK to entity_sensor
    device_id           TEXT NOT NULL,                  -- Denormalized
    sensor_class        TEXT NOT NULL,                  -- Denormalized for queries
    value               REAL NOT NULL,
    unit                TEXT NOT NULL,
    timestamp           INTEGER NOT NULL,               -- Unix timestamp
    
    -- Constraints
    FOREIGN KEY (entity_id) REFERENCES entity_sensor(entity_id) ON DELETE CASCADE
);

CREATE INDEX idx_sensor_history_entity_id ON sensor_history(entity_id);
CREATE INDEX idx_sensor_history_timestamp ON sensor_history(timestamp);
CREATE INDEX idx_sensor_history_sensor_class ON sensor_history(sensor_class);

-- Composite index for range queries
CREATE INDEX idx_sensor_history_entity_time ON sensor_history(entity_id, timestamp);
```

---

### events

Event log for device state changes, errors, and important events.

```sql
CREATE TABLE events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL,
    entity_id           TEXT,                           -- NULL for device-level events
    event_type          TEXT NOT NULL,                  -- "state_change", "error", "warning"
    severity            TEXT NOT NULL DEFAULT 'info',   -- "info", "warning", "error", "critical"
    description         TEXT NOT NULL,
    
    -- Optional details
    old_value           TEXT,                           -- Previous state (JSON)
    new_value           TEXT,                           -- New state (JSON)
    metadata            TEXT,                           -- Additional data (JSON)
    
    -- Timestamp
    timestamp           INTEGER NOT NULL,               -- Unix timestamp
    
    -- Constraints
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
    CONSTRAINT check_severity CHECK (
        severity IN ('info', 'warning', 'error', 'critical')
    )
);

CREATE INDEX idx_events_device_id ON events(device_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_severity ON events(severity);
```

---

## SQL Schema

### Complete Schema Creation Script

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Set journal mode for better performance
PRAGMA journal_mode = WAL;

-- ============================================================================
-- DEVICES TABLE
-- ============================================================================
CREATE TABLE devices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL UNIQUE,
    device_name         TEXT NOT NULL,
    device_type         TEXT NOT NULL,
    manufacturer        TEXT,
    model               TEXT,
    sw_version          TEXT,
    hw_version          TEXT,
    mac_address         TEXT UNIQUE,
    ipv6_addr           TEXT,
    rloc16              TEXT,
    role                TEXT,
    online              INTEGER NOT NULL DEFAULT 1,
    last_seen           INTEGER NOT NULL,
    registered_at       INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    metadata            TEXT,
    CONSTRAINT check_online CHECK (online IN (0, 1))
);

CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_online ON devices(online);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- ============================================================================
-- ENTITIES TABLE
-- ============================================================================
CREATE TABLE entities (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL,
    entity_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    entity_type         TEXT NOT NULL,
    device_class        TEXT,
    available           INTEGER NOT NULL DEFAULT 1,
    last_update         INTEGER NOT NULL,
    metadata            TEXT,
    UNIQUE(device_id, entity_id),
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
    CONSTRAINT check_available CHECK (available IN (0, 1)),
    CONSTRAINT check_entity_type CHECK (
        entity_type IN ('light', 'switch', 'fan', 'sensor', 'climate', 'binary_sensor')
    )
);

CREATE INDEX idx_entities_device_id ON entities(device_id);
CREATE INDEX idx_entities_entity_type ON entities(entity_type);
CREATE INDEX idx_entities_available ON entities(available);

-- ============================================================================
-- ENTITY TYPE TABLES
-- ============================================================================

-- LIGHT
CREATE TABLE entity_light (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    state               INTEGER NOT NULL DEFAULT 0,
    brightness          INTEGER DEFAULT 100,
    color_temp          INTEGER,
    rgb_r               INTEGER,
    rgb_g               INTEGER,
    rgb_b               INTEGER,
    mode                TEXT NOT NULL,
    min_brightness      INTEGER DEFAULT 1,
    max_brightness      INTEGER DEFAULT 100,
    min_color_temp      INTEGER DEFAULT 2700,
    max_color_temp      INTEGER DEFAULT 6500,
    effect              TEXT DEFAULT 'none',
    transition_time     INTEGER DEFAULT 0,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1)),
    CONSTRAINT check_brightness CHECK (brightness BETWEEN 0 AND 100)
);

CREATE INDEX idx_entity_light_device_id ON entity_light(device_id);

-- SWITCH
CREATE TABLE entity_switch (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    state               INTEGER NOT NULL DEFAULT 0,
    pressed             INTEGER DEFAULT 0,
    gang_states         TEXT,
    gang_count          INTEGER DEFAULT 1,
    type                TEXT NOT NULL,
    momentary           INTEGER DEFAULT 0,
    interlock           INTEGER DEFAULT 0,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1))
);

CREATE INDEX idx_entity_switch_device_id ON entity_switch(device_id);

-- FAN
CREATE TABLE entity_fan (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    state               INTEGER NOT NULL DEFAULT 0,
    speed               INTEGER DEFAULT 0,
    mode                TEXT DEFAULT 'off',
    oscillation         INTEGER DEFAULT 0,
    direction           INTEGER DEFAULT 0,
    speed_levels        INTEGER DEFAULT 3,
    supports_oscillation INTEGER DEFAULT 0,
    supports_direction  INTEGER DEFAULT 0,
    supports_timer      INTEGER DEFAULT 0,
    timer_remaining     INTEGER DEFAULT 0,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1)),
    CONSTRAINT check_speed CHECK (speed BETWEEN 0 AND 100)
);

CREATE INDEX idx_entity_fan_device_id ON entity_fan(device_id);

-- SENSOR
CREATE TABLE entity_sensor (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    value               REAL NOT NULL,
    unit                TEXT NOT NULL,
    sensor_class        TEXT NOT NULL,
    min_value           REAL,
    max_value           REAL,
    avg_value           REAL,
    accuracy            REAL,
    update_interval     INTEGER DEFAULT 30,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE
);

CREATE INDEX idx_entity_sensor_device_id ON entity_sensor(device_id);
CREATE INDEX idx_entity_sensor_class ON entity_sensor(sensor_class);

-- CLIMATE
CREATE TABLE entity_climate (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    mode                TEXT NOT NULL DEFAULT 'off',
    current_temp        REAL,
    target_temp         REAL NOT NULL,
    current_humidity    INTEGER,
    fan_speed           TEXT DEFAULT 'auto',
    swing               INTEGER DEFAULT 0,
    eco_mode            INTEGER DEFAULT 0,
    turbo_mode          INTEGER DEFAULT 0,
    min_temp            REAL DEFAULT 16.0,
    max_temp            REAL DEFAULT 30.0,
    supports_heat       INTEGER DEFAULT 0,
    supports_cool       INTEGER DEFAULT 1,
    supports_dry        INTEGER DEFAULT 0,
    supports_swing      INTEGER DEFAULT 0,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE
);

CREATE INDEX idx_entity_climate_device_id ON entity_climate(device_id);

-- BINARY SENSOR
CREATE TABLE entity_binary_sensor (
    entity_id           TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL,
    state               INTEGER NOT NULL DEFAULT 0,
    sensor_class        TEXT NOT NULL,
    last_triggered      INTEGER,
    trigger_count       INTEGER DEFAULT 0,
    debounce_time       INTEGER DEFAULT 0,
    updated_at          INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
    CONSTRAINT check_state CHECK (state IN (0, 1))
);

CREATE INDEX idx_entity_binary_sensor_device_id ON entity_binary_sensor(device_id);
CREATE INDEX idx_entity_binary_sensor_state ON entity_binary_sensor(state);

-- ============================================================================
-- HISTORY & EVENTS
-- ============================================================================

-- SENSOR HISTORY
CREATE TABLE sensor_history (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id           TEXT NOT NULL,
    device_id           TEXT NOT NULL,
    sensor_class        TEXT NOT NULL,
    value               REAL NOT NULL,
    unit                TEXT NOT NULL,
    timestamp           INTEGER NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES entity_sensor(entity_id) ON DELETE CASCADE
);

CREATE INDEX idx_sensor_history_entity_id ON sensor_history(entity_id);
CREATE INDEX idx_sensor_history_timestamp ON sensor_history(timestamp);
CREATE INDEX idx_sensor_history_entity_time ON sensor_history(entity_id, timestamp);

-- EVENTS
CREATE TABLE events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id           TEXT NOT NULL,
    entity_id           TEXT,
    event_type          TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'info',
    description         TEXT NOT NULL,
    old_value           TEXT,
    new_value           TEXT,
    metadata            TEXT,
    timestamp           INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
    CONSTRAINT check_severity CHECK (
        severity IN ('info', 'warning', 'error', 'critical')
    )
);

CREATE INDEX idx_events_device_id ON events(device_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_event_type ON events(event_type);

-- ============================================================================
-- VIEWS (Optional - for convenient queries)
-- ============================================================================

-- All lights with device info
CREATE VIEW view_lights AS
SELECT 
    d.device_id,
    d.device_name,
    e.entity_id,
    e.name AS entity_name,
    l.*
FROM devices d
JOIN entities e ON d.device_id = e.device_id
JOIN entity_light l ON e.entity_id = l.entity_id
WHERE d.online = 1 AND e.available = 1;

-- All sensors with latest readings
CREATE VIEW view_sensors AS
SELECT 
    d.device_id,
    d.device_name,
    e.entity_id,
    e.name AS entity_name,
    s.*
FROM devices d
JOIN entities e ON d.device_id = e.device_id
JOIN entity_sensor s ON e.entity_id = s.entity_id
WHERE d.online = 1 AND e.available = 1;

-- Recent events (last 24 hours)
CREATE VIEW view_recent_events AS
SELECT *
FROM events
WHERE timestamp > strftime('%s', 'now') - 86400
ORDER BY timestamp DESC;
```

---

## Query Examples

### Device Operations

#### Register New Device

```sql
BEGIN TRANSACTION;

-- Insert device
INSERT INTO devices (
    device_id, device_name, device_type, manufacturer, model,
    sw_version, mac_address, ipv6_addr, rloc16, role,
    last_seen, registered_at, updated_at
) VALUES (
    'living-room-001',
    'Living Room Controller',
    'light_controller',
    'MyCompany',
    'LC-100',
    '1.0.0',
    '0x1234567890ABCDEF',
    'fd00::1234:5678',
    '0x2800',
    'router',
    strftime('%s', 'now'),
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Insert entity
INSERT INTO entities (
    device_id, entity_id, name, entity_type, device_class,
    available, last_update
) VALUES (
    'living-room-001',
    'light_1',
    'Ceiling Light',
    'light',
    'dimmable',
    1,
    strftime('%s', 'now')
);

-- Insert light-specific data
INSERT INTO entity_light (
    entity_id, device_id, state, brightness, mode, updated_at
) VALUES (
    'light_1',
    'living-room-001',
    0,
    100,
    'dimmable',
    strftime('%s', 'now')
);

COMMIT;
```

#### Get All Online Devices

```sql
SELECT 
    device_id,
    device_name,
    device_type,
    ipv6_addr,
    role,
    datetime(last_seen, 'unixepoch') AS last_seen_time
FROM devices
WHERE online = 1
ORDER BY device_name;
```

#### Get Device with All Entities

```sql
SELECT 
    d.device_id,
    d.device_name,
    e.entity_id,
    e.name AS entity_name,
    e.entity_type,
    e.device_class,
    e.available
FROM devices d
LEFT JOIN entities e ON d.device_id = e.device_id
WHERE d.device_id = 'living-room-001'
ORDER BY e.entity_type, e.entity_id;
```

---

### Entity Operations

#### Update Light State

```sql
UPDATE entity_light
SET 
    state = 1,
    brightness = 80,
    updated_at = strftime('%s', 'now')
WHERE entity_id = 'light_1';

-- Also update entity timestamp
UPDATE entities
SET last_update = strftime('%s', 'now')
WHERE entity_id = 'light_1';

-- Log event
INSERT INTO events (
    device_id, entity_id, event_type, severity,
    description, old_value, new_value, timestamp
) VALUES (
    'living-room-001',
    'light_1',
    'state_change',
    'info',
    'Light turned on',
    '{"state": 0, "brightness": 100}',
    '{"state": 1, "brightness": 80}',
    strftime('%s', 'now')
);
```

#### Get All Lights That Are ON

```sql
SELECT 
    d.device_name,
    e.name AS light_name,
    l.brightness,
    l.color_temp
FROM entity_light l
JOIN entities e ON l.entity_id = e.entity_id
JOIN devices d ON l.device_id = d.device_id
WHERE l.state = 1
  AND d.online = 1
  AND e.available = 1;
```

#### Update Sensor Value and History

```sql
BEGIN TRANSACTION;

-- Update current value
UPDATE entity_sensor
SET 
    value = 25.3,
    updated_at = strftime('%s', 'now')
WHERE entity_id = 'temp_1';

-- Insert history record
INSERT INTO sensor_history (
    entity_id, device_id, sensor_class, value, unit, timestamp
) VALUES (
    'temp_1',
    'living-room-001',
    'temperature',
    25.3,
    '°C',
    strftime('%s', 'now')
);

-- Update statistics (min/max/avg in last 24h)
UPDATE entity_sensor
SET 
    min_value = (
        SELECT MIN(value) 
        FROM sensor_history 
        WHERE entity_id = 'temp_1'
          AND timestamp > strftime('%s', 'now') - 86400
    ),
    max_value = (
        SELECT MAX(value)
        FROM sensor_history
        WHERE entity_id = 'temp_1'
          AND timestamp > strftime('%s', 'now') - 86400
    ),
    avg_value = (
        SELECT AVG(value)
        FROM sensor_history
        WHERE entity_id = 'temp_1'
          AND timestamp > strftime('%s', 'now') - 86400
    )
WHERE entity_id = 'temp_1';

COMMIT;
```

---

### Analytics Queries

#### Get Temperature Trend (Last 24 Hours)

```sql
SELECT 
    datetime(timestamp, 'unixepoch') AS time,
    value,
    unit
FROM sensor_history
WHERE entity_id = 'temp_1'
  AND timestamp > strftime('%s', 'now') - 86400
ORDER BY timestamp ASC;
```

#### Get All Motion Detections Today

```sql
SELECT 
    d.device_name,
    e.name AS sensor_name,
    datetime(b.last_triggered, 'unixepoch') AS triggered_time,
    b.trigger_count
FROM entity_binary_sensor b
JOIN entities e ON b.entity_id = e.entity_id
JOIN devices d ON b.device_id = d.device_id
WHERE b.sensor_class = 'motion'
  AND b.last_triggered > strftime('%s', 'now', 'start of day')
ORDER BY b.last_triggered DESC;
```

#### Get Average Temperature by Room (Last Week)

```sql
SELECT 
    d.device_name AS room,
    e.name AS sensor_name,
    ROUND(AVG(h.value), 1) AS avg_temp,
    ROUND(MIN(h.value), 1) AS min_temp,
    ROUND(MAX(h.value), 1) AS max_temp
FROM sensor_history h
JOIN entities e ON h.entity_id = e.entity_id
JOIN devices d ON h.device_id = d.device_id
WHERE h.sensor_class = 'temperature'
  AND h.timestamp > strftime('%s', 'now') - 604800
GROUP BY h.device_id, h.entity_id
ORDER BY d.device_name;
```

#### Get Recent Errors and Warnings

```sql
SELECT 
    datetime(timestamp, 'unixepoch') AS time,
    d.device_name,
    severity,
    event_type,
    description
FROM events e
JOIN devices d ON e.device_id = d.device_id
WHERE severity IN ('warning', 'error', 'critical')
  AND timestamp > strftime('%s', 'now') - 86400
ORDER BY timestamp DESC;
```

---

### Maintenance Queries

#### Delete Old Sensor History (Keep Last 30 Days)

```sql
DELETE FROM sensor_history
WHERE timestamp < strftime('%s', 'now') - 2592000;
```

#### Delete Old Events (Keep Last 7 Days)

```sql
DELETE FROM events
WHERE timestamp < strftime('%s', 'now') - 604800;
```

#### Mark Offline Devices (Not Seen in 5 Minutes)

```sql
UPDATE devices
SET online = 0
WHERE last_seen < strftime('%s', 'now') - 300;
```

#### Vacuum Database (Optimize)

```sql
VACUUM;
ANALYZE;
```

---

## C API Implementation

### Database Connection

```c
#include <sqlite3.h>
#include <stdio.h>
#include <time.h>

typedef struct {
    sqlite3 *db;
    char *db_path;
} iot_database_t;

// Open database
int iot_db_open(iot_database_t *db, const char *path) {
    int rc = sqlite3_open(path, &db->db);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Cannot open database: %s", sqlite3_errmsg(db->db));
        return -1;
    }
    
    // Enable foreign keys
    sqlite3_exec(db->db, "PRAGMA foreign_keys = ON;", NULL, NULL, NULL);
    
    // Set WAL mode for better concurrency
    sqlite3_exec(db->db, "PRAGMA journal_mode = WAL;", NULL, NULL, NULL);
    
    ESP_LOGI(TAG, "Database opened: %s", path);
    return 0;
}

// Close database
void iot_db_close(iot_database_t *db) {
    if (db->db) {
        sqlite3_close(db->db);
        db->db = NULL;
    }
}
```

### Device Registration

```c
int iot_db_register_device(iot_database_t *db, const device_model_t *device) {
    sqlite3_stmt *stmt;
    int rc;
    
    const char *sql = 
        "INSERT INTO devices ("
        "  device_id, device_name, device_type, manufacturer, model,"
        "  sw_version, mac_address, ipv6_addr, rloc16, role,"
        "  last_seen, registered_at, updated_at"
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    rc = sqlite3_prepare_v2(db->db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        ESP_LOGE(TAG, "Failed to prepare: %s", sqlite3_errmsg(db->db));
        return -1;
    }
    
    time_t now = time(NULL);
    
    sqlite3_bind_text(stmt, 1, device->info.device_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, device->info.device_name, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, device->info.device_type, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, device->info.manufacturer, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 5, device->info.model, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 6, device->info.sw_version, -1, SQLITE_TRANSIENT);
    
    char mac_str[32];
    snprintf(mac_str, sizeof(mac_str), "0x%016llX", device->info.mac_address);
    sqlite3_bind_text(stmt, 7, mac_str, -1, SQLITE_TRANSIENT);
    
    // TODO: Convert IPv6 to string
    sqlite3_bind_text(stmt, 8, "fd00::1234", -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 9, "0x2800", -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 10, "router", -1, SQLITE_TRANSIENT);
    
    sqlite3_bind_int64(stmt, 11, now);
    sqlite3_bind_int64(stmt, 12, now);
    sqlite3_bind_int64(stmt, 13, now);
    
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    if (rc != SQLITE_DONE) {
        ESP_LOGE(TAG, "Failed to insert device: %s", sqlite3_errmsg(db->db));
        return -1;
    }
    
    ESP_LOGI(TAG, "Device registered: %s", device->info.device_id);
    return 0;
}
```

### Update Light State

```c
int iot_db_update_light(iot_database_t *db, const char *entity_id,
                         bool state, uint8_t brightness) {
    sqlite3_stmt *stmt;
    int rc;
    
    const char *sql = 
        "UPDATE entity_light SET state = ?, brightness = ?, updated_at = ? "
        "WHERE entity_id = ?";
    
    rc = sqlite3_prepare_v2(db->db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) return -1;
    
    sqlite3_bind_int(stmt, 1, state ? 1 : 0);
    sqlite3_bind_int(stmt, 2, brightness);
    sqlite3_bind_int64(stmt, 3, time(NULL));
    sqlite3_bind_text(stmt, 4, entity_id, -1, SQLITE_TRANSIENT);
    
    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    return (rc == SQLITE_DONE) ? 0 : -1;
}
```

### Insert Sensor Reading

```c
int iot_db_insert_sensor_reading(iot_database_t *db, const char *entity_id,
                                  const char *device_id, const char *sensor_class,
                                  float value, const char *unit) {
    sqlite3_stmt *stmt;
    int rc;
    
    // Begin transaction
    sqlite3_exec(db->db, "BEGIN TRANSACTION", NULL, NULL, NULL);
    
    // Update current value
    const char *sql1 = 
        "UPDATE entity_sensor SET value = ?, updated_at = ? WHERE entity_id = ?";
    
    sqlite3_prepare_v2(db->db, sql1, -1, &stmt, NULL);
    sqlite3_bind_double(stmt, 1, value);
    sqlite3_bind_int64(stmt, 2, time(NULL));
    sqlite3_bind_text(stmt, 3, entity_id, -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    // Insert history
    const char *sql2 = 
        "INSERT INTO sensor_history (entity_id, device_id, sensor_class, "
        "value, unit, timestamp) VALUES (?, ?, ?, ?, ?, ?)";
    
    sqlite3_prepare_v2(db->db, sql2, -1, &stmt, NULL);
    sqlite3_bind_text(stmt, 1, entity_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, device_id, -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, sensor_class, -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(stmt, 4, value);
    sqlite3_bind_text(stmt, 5, unit, -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(stmt, 6, time(NULL));
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    
    // Commit transaction
    sqlite3_exec(db->db, "COMMIT", NULL, NULL, NULL);
    
    return 0;
}
```

### Query All Lights

```c
typedef struct {
    char entity_id[16];
    char name[32];
    bool state;
    uint8_t brightness;
} light_info_t;

int iot_db_get_all_lights(iot_database_t *db, light_info_t *lights, int max_count) {
    sqlite3_stmt *stmt;
    int rc, count = 0;
    
    const char *sql = 
        "SELECT e.entity_id, e.name, l.state, l.brightness "
        "FROM entities e "
        "JOIN entity_light l ON e.entity_id = l.entity_id "
        "WHERE e.available = 1";
    
    rc = sqlite3_prepare_v2(db->db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) return -1;
    
    while (sqlite3_step(stmt) == SQLITE_ROW && count < max_count) {
        strcpy(lights[count].entity_id, (const char *)sqlite3_column_text(stmt, 0));
        strcpy(lights[count].name, (const char *)sqlite3_column_text(stmt, 1));
        lights[count].state = sqlite3_column_int(stmt, 2);
        lights[count].brightness = sqlite3_column_int(stmt, 3);
        count++;
    }
    
    sqlite3_finalize(stmt);
    return count;
}
```

---

## Migration & Maintenance

### Schema Version Tracking

```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    description TEXT
);

INSERT INTO schema_version (version, applied_at, description)
VALUES (1, strftime('%s', 'now'), 'Initial schema');
```

### Automated Cleanup Task

```c
void iot_db_cleanup_task(void *param) {
    iot_database_t *db = (iot_database_t *)param;
    
    while (1) {
        // Run cleanup once per day
        vTaskDelay(pdMS_TO_TICKS(86400000));
        
        ESP_LOGI(TAG, "Running database cleanup...");
        
        // Delete old sensor history (>30 days)
        sqlite3_exec(db->db,
            "DELETE FROM sensor_history "
            "WHERE timestamp < strftime('%s', 'now') - 2592000",
            NULL, NULL, NULL);
        
        // Delete old events (>7 days)
        sqlite3_exec(db->db,
            "DELETE FROM events "
            "WHERE timestamp < strftime('%s', 'now') - 604800",
            NULL, NULL, NULL);
        
        // Vacuum database
        sqlite3_exec(db->db, "VACUUM", NULL, NULL, NULL);
        
        ESP_LOGI(TAG, "Database cleanup completed");
    }
}
```

---

## Summary

This SQLite schema provides:

- ✅ **Normalized structure** - Eliminates redundancy
- ✅ **Flexible entity types** - Easy to add new types
- ✅ **Historical data** - Sensor readings and events
- ✅ **Fast queries** - Proper indexes for common operations
- ✅ **Data integrity** - Foreign keys and constraints
- ✅ **Extensible** - JSON fields for custom attributes
- ✅ **Maintenance-friendly** - Cleanup tasks and views

Perfect for running on ESP32 border router with SD card storage!