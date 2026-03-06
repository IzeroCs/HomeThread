/*
 * Thread Discovery - SRP/DNS-SD + NVS cache + static fallback.
 */
#include <string.h>
#include <time.h>
#include "sdkconfig.h"
#include "thread_discovery.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/semphr.h"
#include "nvs.h"
#include "openthread/dns_client.h"
#include "openthread/error.h"
#include "openthread/instance.h"

static const char *TAG = "thread_discovery";

/* Default SRP/DNS-SD service for Dashboard backend. */
#define BACKEND_SERVICE_NAME "_dashboard._udp.default.service.arpa"
#define BACKEND_COAP_DEFAULT_PORT 5683

/* Default NVS keys */
#define DEFAULT_NVS_NAMESPACE   "backend"
#define DEFAULT_KEY_SRP_EP      "srp_ep"
#define DEFAULT_KEY_STATIC_EP   "static_ep"

typedef struct {
    uint8_t addr[16];
    uint16_t port;
    uint8_t origin;   /* 1 = SRP, 2 = STATIC */
    uint32_t ts;      /* discovery timestamp (epoch seconds) */
} backend_ep_storage_t;

typedef struct {
    thread_discovery_cfg_t cfg;
    bool initialized;
    SemaphoreHandle_t dns_sem;
    otIp6Address dns_addr;
    uint16_t dns_port;
    bool dns_valid;
} thread_discovery_ctx_t;

static thread_discovery_ctx_t s_ctx;

static const char *get_ns(void)
{
    return s_ctx.cfg.nvs_namespace ? s_ctx.cfg.nvs_namespace : DEFAULT_NVS_NAMESPACE;
}

static const char *get_key_srp(void)
{
    return s_ctx.cfg.cache_key_srp ? s_ctx.cfg.cache_key_srp : DEFAULT_KEY_SRP_EP;
}

static const char *get_key_static(void)
{
    return s_ctx.cfg.cache_key_static ? s_ctx.cfg.cache_key_static : DEFAULT_KEY_STATIC_EP;
}

static esp_err_t nvs_open_backend(nvs_handle_t *handle)
{
    if (!handle) {
        return ESP_ERR_INVALID_ARG;
    }
    return nvs_open(get_ns(), NVS_READWRITE, handle);
}

static void storage_to_endpoint(const backend_ep_storage_t *st, thread_discovery_endpoint_t *out)
{
    if (!st || !out) {
        return;
    }
    memset(out, 0, sizeof(*out));
    memcpy(out->addr.mFields.m8, st->addr, sizeof(st->addr));
    out->port = st->port;
    out->from_srp = (st->origin == 1);
}

static void endpoint_to_storage(const thread_discovery_endpoint_t *ep, uint8_t origin, backend_ep_storage_t *out)
{
    if (!ep || !out) {
        return;
    }
    memset(out, 0, sizeof(*out));
    memcpy(out->addr, ep->addr.mFields.m8, sizeof(out->addr));
    out->port = ep->port;
    out->origin = origin;
    out->ts = (uint32_t)time(NULL);
}

/** Load endpoint from NVS into storage (caller can check st.ts for TTL). */
static esp_err_t nvs_load_srp_storage(backend_ep_storage_t *st)
{
    if (!st) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t nvs = 0;
    esp_err_t err = nvs_open_backend(&nvs);
    if (err != ESP_OK) {
        return err;
    }

    size_t len = sizeof(backend_ep_storage_t);
    err = nvs_get_blob(nvs, get_key_srp(), st, &len);
    nvs_close(nvs);

    if (err != ESP_OK || len != sizeof(backend_ep_storage_t)) {
        return (err == ESP_OK) ? ESP_FAIL : err;
    }
    return ESP_OK;
}

static esp_err_t nvs_load_endpoint(const char *key, thread_discovery_endpoint_t *out)
{
    if (!key || !out) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t nvs = 0;
    esp_err_t err = nvs_open_backend(&nvs);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open_backend failed: %s", esp_err_to_name(err));
        return err;
    }

    backend_ep_storage_t st;
    size_t len = sizeof(st);
    err = nvs_get_blob(nvs, key, &st, &len);
    nvs_close(nvs);

    if (err != ESP_OK) {
        return err;
    }

    if (len != sizeof(st)) {
        ESP_LOGW(TAG, "Unexpected blob size for key %s", key);
        return ESP_FAIL;
    }

    storage_to_endpoint(&st, out);
    return ESP_OK;
}

static esp_err_t nvs_save_endpoint(const char *key, const thread_discovery_endpoint_t *ep, uint8_t origin)
{
    if (!key || !ep) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t nvs = 0;
    esp_err_t err = nvs_open_backend(&nvs);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open_backend failed: %s", esp_err_to_name(err));
        return err;
    }

    backend_ep_storage_t st;
    endpoint_to_storage(ep, origin, &st);

    err = nvs_set_blob(nvs, key, &st, sizeof(st));
    if (err == ESP_OK) {
        err = nvs_commit(nvs);
    }
    nvs_close(nvs);
    return err;
}

static bool nvs_has_key(const char *key)
{
    if (!key) {
        return false;
    }
    nvs_handle_t nvs = 0;
    esp_err_t err = nvs_open_backend(&nvs);
    if (err != ESP_OK) {
        return false;
    }
    size_t len = 0;
    err = nvs_get_blob(nvs, key, NULL, &len);
    nvs_close(nvs);
    return (err == ESP_OK && len == sizeof(backend_ep_storage_t));
}

/* DNS-SD browse callback: called on OpenThread task context. */
static void dns_browse_callback(otError aError, const otDnsBrowseResponse *aResponse, void *aContext)
{
    thread_discovery_ctx_t *ctx = (thread_discovery_ctx_t *)aContext;
    if (!ctx || !ctx->dns_sem) {
        return;
    }

    ctx->dns_valid = false;

    if (aError != OT_ERROR_NONE || aResponse == NULL) {
        ESP_LOGW(TAG, "DNS browse error: %s", otThreadErrorToString(aError));
        xSemaphoreGive(ctx->dns_sem);
        return;
    }

    otError err;
    char instance_label[64];
    char host_name_buf[256];

    /* Get first service instance label */
    err = otDnsBrowseResponseGetServiceInstance(aResponse, 0, instance_label, sizeof(instance_label));
    if (err != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "otDnsBrowseResponseGetServiceInstance failed: %s", otThreadErrorToString(err));
        xSemaphoreGive(ctx->dns_sem);
        return;
    }

    otDnsServiceInfo service_info;
    memset(&service_info, 0, sizeof(service_info));
    service_info.mHostNameBuffer = host_name_buf;
    service_info.mHostNameBufferSize = sizeof(host_name_buf);
    err = otDnsBrowseResponseGetServiceInfo(aResponse, instance_label, &service_info);
    if (err != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "otDnsBrowseResponseGetServiceInfo failed: %s", otThreadErrorToString(err));
        xSemaphoreGive(ctx->dns_sem);
        return;
    }

    /* Resolve host AAAA address for this service. */
    uint32_t ttl = 0;
    otIp6Address addr;
    memset(&addr, 0, sizeof(addr));

    err = otDnsBrowseResponseGetHostAddress(aResponse,
                                            service_info.mHostNameBuffer,
                                            0,
                                            &addr,
                                            &ttl);
    if (err != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "otDnsBrowseResponseGetHostAddress failed: %s", otThreadErrorToString(err));
        xSemaphoreGive(ctx->dns_sem);
        return;
    }

    ctx->dns_addr = addr;
    ctx->dns_port = service_info.mPort ? service_info.mPort : BACKEND_COAP_DEFAULT_PORT;
    ctx->dns_valid = true;

    xSemaphoreGive(ctx->dns_sem);
}

static esp_err_t srp_discover_once(thread_discovery_endpoint_t *out)
{
    if (!out) {
        return ESP_ERR_INVALID_ARG;
    }

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (!s_ctx.dns_sem) {
        s_ctx.dns_sem = xSemaphoreCreateBinary();
        if (!s_ctx.dns_sem) {
            ESP_LOGE(TAG, "Failed to create DNS semaphore");
            return ESP_ERR_NO_MEM;
        }
    } else {
        xSemaphoreTake(s_ctx.dns_sem, 0);
    }

    s_ctx.dns_valid = false;
    memset(&s_ctx.dns_addr, 0, sizeof(s_ctx.dns_addr));
    s_ctx.dns_port = BACKEND_COAP_DEFAULT_PORT;

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    const otDnsQueryConfig *default_cfg = otDnsClientGetDefaultConfig(instance);
    otError err = otDnsClientBrowse(instance,
                                    BACKEND_SERVICE_NAME,
                                    dns_browse_callback,
                                    &s_ctx,
                                    default_cfg);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otDnsClientBrowse failed: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    /* Wait for callback to signal completion. */
    if (xSemaphoreTake(s_ctx.dns_sem, pdMS_TO_TICKS(3000)) != pdTRUE) {
        ESP_LOGD(TAG, "DNS browse timeout");
        return ESP_ERR_TIMEOUT;
    }

    if (!s_ctx.dns_valid) {
        ESP_LOGD(TAG, "DNS browse did not return a valid service");
        return ESP_FAIL;
    }

    memset(out, 0, sizeof(*out));
    out->addr = s_ctx.dns_addr;
    out->port = s_ctx.dns_port;
    out->from_srp = true;

    /* Caller (thread_node) logs backend IP once / when changed at INFO. */
    char addr_str[40];
    otIp6AddressToString(&out->addr, addr_str, sizeof(addr_str));
    ESP_LOGD(TAG, "Discovered backend via SRP: [%s]:%u", addr_str, out->port);
    return ESP_OK;
}

esp_err_t thread_discovery_init(const thread_discovery_cfg_t *cfg)
{
    if (s_ctx.initialized) {
        return ESP_OK;
    }

    if (cfg) {
        s_ctx.cfg = *cfg;
    } else {
        memset(&s_ctx.cfg, 0, sizeof(s_ctx.cfg));
    }

    s_ctx.dns_sem = NULL;
    s_ctx.dns_valid = false;
    memset(&s_ctx.dns_addr, 0, sizeof(s_ctx.dns_addr));
    s_ctx.dns_port = BACKEND_COAP_DEFAULT_PORT;

    s_ctx.initialized = true;
    ESP_LOGI(TAG, "Thread discovery initialized (ns=\"%s\")", get_ns());
    return ESP_OK;
}

esp_err_t thread_discovery_get_endpoint(thread_discovery_endpoint_t *out, bool force_refresh)
{
    if (!out) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!s_ctx.initialized) {
        thread_discovery_init(NULL);
    }

    esp_err_t err;
    thread_discovery_endpoint_t ep;

    /* 1) Try SRP cache if not forcing refresh. Honour cache_ttl_sec: if set and cache expired, treat as miss. */
    if (!force_refresh) {
        backend_ep_storage_t st;
        err = nvs_load_srp_storage(&st);
        if (err == ESP_OK) {
            uint32_t ttl = s_ctx.cfg.cache_ttl_sec;
            uint32_t now = (uint32_t)time(NULL);
            if (ttl == 0 || (now - st.ts) <= ttl) {
                storage_to_endpoint(&st, out);
                ESP_LOGD(TAG, "Using cached SRP backend endpoint");
                return ESP_OK;
            }
            /* Cache expired, fall through to SRP discovery. */
        }
    }

    /* 2) Try SRP/DNS-SD discovery. */
    err = srp_discover_once(&ep);
    if (err == ESP_OK) {
        /* Save to SRP cache. */
        esp_err_t nvs_err = nvs_save_endpoint(get_key_srp(), &ep, 1);
        if (nvs_err != ESP_OK) {
            ESP_LOGW(TAG, "Failed to cache SRP endpoint: %s", esp_err_to_name(nvs_err));
        }
        *out = ep;
        return ESP_OK;
    }

    ESP_LOGD(TAG, "SRP discovery failed (%s), trying static fallback", esp_err_to_name(err));

    /* 3) Fallback to static config if available. */
    err = nvs_load_endpoint(get_key_static(), &ep);
    if (err == ESP_OK) {
        *out = ep;
        ESP_LOGD(TAG, "Using static backend endpoint from NVS");
        return ESP_OK;
    }

    ESP_LOGI(TAG, "Backend not available yet (will retry in 60s)");
    return ESP_ERR_NOT_FOUND;
}

esp_err_t thread_discovery_set_static(const thread_discovery_endpoint_t *ep)
{
    if (!ep) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!s_ctx.initialized) {
        thread_discovery_init(NULL);
    }

    esp_err_t err = nvs_save_endpoint(get_key_static(), ep, 2);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save static backend endpoint: %s", esp_err_to_name(err));
        return err;
    }

    char addr_str[40];
    otIp6AddressToString(&ep->addr, addr_str, sizeof(addr_str));
    ESP_LOGI(TAG, "Static backend endpoint saved: [%s]:%u", addr_str, ep->port);
    return ESP_OK;
}

bool thread_discovery_has_static(void)
{
    if (!s_ctx.initialized) {
        thread_discovery_init(NULL);
    }
    return nvs_has_key(get_key_static());
}
