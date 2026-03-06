/*
 * Thread Discovery - SRP/DNS-SD + NVS cache + static fallback.
 *
 * Thread-Node (child) uses this module to discover the Dashboard backend
 * service `_dashboard._udp.default.svc.arpa` via OpenThread DNS client,
 * then cache the resolved IPv6 address + port in NVS. If discovery fails,
 * the module falls back to a statically configured endpoint (also stored
 * in NVS, e.g. provisioned during commissioning).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "openthread/ip6.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Backend endpoint information (discovered or static).
 *
 * addr:   IPv6 address of backend server (reachable through BR).
 * port:   UDP port (CoAP default: 5683).
 * from_srp: true if discovered via SRP/DNS-SD, false if from static config.
 */
typedef struct {
    otIp6Address addr;
    uint16_t port;
    bool from_srp;
} thread_discovery_endpoint_t;

/**
 * Thread discovery configuration (optional).
 *
 * nvs_namespace:   NVS namespace used to store endpoint info. If NULL, a
 *                  default namespace "backend" is used.
 * cache_key_srp:   NVS key for SRP/DNS-SD cached endpoint. If NULL, default
 *                  key "srp_ep" is used.
 * cache_key_static:NVS key for statically provisioned endpoint. If NULL,
 *                  default key "static_ep" is used.
 * cache_ttl_sec:   Optional TTL hint for SRP cache (0 = no TTL check).
 */
typedef struct {
    const char *nvs_namespace;
    const char *cache_key_srp;
    const char *cache_key_static;
    uint32_t cache_ttl_sec;
} thread_discovery_cfg_t;

/**
 * Initialize thread discovery module.
 *
 * Must be called after NVS has been initialized (thread_node_start()
 * already does this before joining).
 *
 * @param cfg Optional configuration (may be NULL for defaults).
 * @return ESP_OK on success.
 */
esp_err_t thread_discovery_init(const thread_discovery_cfg_t *cfg);

/**
 * Get backend endpoint.
 *
 * Resolution order:
 *  1. If SRP cache exists in NVS and force_refresh == false → return it.
 *  2. Otherwise attempt SRP/DNS-SD discovery:
 *       - Browse `_dashboard._udp.default.svc.arpa`
 *       - Resolve SRV → hostname + port
 *       - Resolve AAAA for hostname → IPv6 address
 *       - Cache result in NVS (SRP cache)
 *  3. If discovery fails → try static endpoint from NVS.
 *
 * @param out           Output endpoint.
 * @param force_refresh If true, always attempt SRP/DNS-SD discovery first
 *                      (ignoring SRP cache, but still falling back to static).
 * @return ESP_OK on success, error otherwise.
 */
esp_err_t thread_discovery_get_endpoint(thread_discovery_endpoint_t *out, bool force_refresh);

/**
 * Set static backend endpoint (provisioned).
 *
 * Typically called during commissioning to store a known-good backend
 * IPv6 address + port for fallback use.
 *
 * @param ep Endpoint to persist as static config.
 * @return ESP_OK on success.
 */
esp_err_t thread_discovery_set_static(const thread_discovery_endpoint_t *ep);

/**
 * Check if a static backend endpoint is present in NVS.
 *
 * @return true if static endpoint exists, false otherwise.
 */
bool thread_discovery_has_static(void);

#ifdef __cplusplus
}
#endif
