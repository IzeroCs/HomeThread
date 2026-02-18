# Migration Plan: Option C - Struct-Based Entity Model

Tài liệu này mô tả chi tiết cách migrate từ callback-based entity model sang struct-based model theo specification.

---

## 📋 Tổng quan

### Hiện tại (Callback-Based):
- Entity model dùng callbacks để get/set attributes
- `instance_data` là `void*` generic
- Flexible nhưng không type-safe
- Khó serialize trực tiếp

### Mục tiêu (Struct-Based):
- Entity model lưu trực tiếp structs (`entity_light_t`, `entity_sensor_t`, etc.)
- Type-safe với struct definitions
- Dễ serialize trực tiếp sang CBOR/JSON
- Match với specification trong `IoT_Entity_Model_Specification.md`

---

## 🎯 Kiến trúc mới

### Flow mới:

```
┌─────────────────────────────────────────┐
│  Driver Layer                           │
│  - Tạo entity_light_t struct            │
│  - Fill đầy đủ fields                    │
│  - Gọi entity_add() với struct pointer  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Entity Model Core                      │
│  - Lưu void* → entity_light_t*          │
│  - entity_get() đọc từ struct           │
│  - entity_set() ghi vào struct           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Serialization Layer                    │
│  - Cast void* → entity_light_t*         │
│  - Serialize trực tiếp từ struct        │
└─────────────────────────────────────────┘
```

---

## 📝 Các bước Migration

### **Bước 1: Sửa Entity Model Core**

#### 1.1 Sửa `entity_model_priv.h`

**Thay đổi:**

```c
// TRƯỚC:
typedef struct entity {
    const char *entity_id;      // String pointer
    const char *name;            // String pointer
    const entity_type_t *type;   // Type pointer với callbacks
    void *instance_data;         // Generic pointer
} entity_t;

// SAU:
typedef struct entity {
    entity_base_t base;          // Full base structure với fields
    entity_type_t type_enum;     // Enum thay vì pointer
    void *entity_struct;         // Pointer đến entity_light_t, etc.
} entity_t;
```

**Lý do:**
- `entity_base_t` chứa đầy đủ metadata (entity_id, name, device_class, available, last_update)
- `type_enum` để biết loại struct để cast
- `entity_struct` trỏ đến struct cụ thể

#### 1.2 Sửa `entity_model.c`

**Thay đổi `entity_register_type()`:**

```c
// TRƯỚC:
int entity_register_type(const char *type_id,
                         entity_get_attr_fn get_cb,
                         entity_set_attr_fn set_cb)

// SAU:
int entity_register_type(const char *type_id, entity_type_t type_enum)
```

**Thay đổi `entity_add()`:**

```c
// TRƯỚC:
int entity_add(const char *entity_id, const char *type_id,
               const char *name, void *instance_data)

// SAU:
int entity_add(void *entity_struct, entity_type_t type_enum)
// entity_struct phải có entity_base_t base ở đầu
// Validate: check base.entity_id, base.name, base.type == type_enum
```

**Thay đổi `entity_get()`:**

```c
// TRƯỚC:
// Gọi callback: e->type->get_cb(entity_id, attr, instance_data, ...)

// SAU:
// Cast dựa trên type_enum:
switch (e->type_enum) {
    case ENTITY_TYPE_LIGHT: {
        entity_light_t *light = (entity_light_t*)e->entity_struct;
        // Đọc từ struct fields
        if (strcmp(attr, "state") == 0) {
            snprintf(value_buf, value_buf_len, "%s", light->state ? "on" : "off");
        }
        // ...
    }
    // ...
}
```

**Thay đổi `entity_set()`:**

```c
// TRƯỚC:
// Gọi callback: e->type->set_cb(entity_id, attr, value, instance_data)

// SAU:
// Cast và ghi trực tiếp:
switch (e->type_enum) {
    case ENTITY_TYPE_LIGHT: {
        entity_light_t *light = (entity_light_t*)e->entity_struct;
        if (strcmp(attr, "state") == 0) {
            light->state = (strcmp(value, "on") == 0);
            light->base.last_update = time(NULL);
        }
        // ...
    }
    // ...
}
```

**Thay đổi `entity_describe()`:**

```c
// TRƯỚC:
// snprintf(..., e->entity_id, e->type->type_id, e->name)

// SAU:
// Đọc từ base structure:
snprintf(..., e->base.entity_id, type_id_string, e->base.name)
```

---

### **Bước 2: Sửa Driver Layer**

#### 2.1 Sửa `on_off_light.c`

**TRƯỚC:**
```c
// Custom instance struct
typedef struct {
    gpio_num_t gpio;
    bool state;
    bool invert_logic;
} on_off_light_instance_t;

// Callbacks
static int get_attr(...) { /* read from instance_data */ }
static int set_attr(...) { /* write to instance_data, control GPIO */ }

// Register với callbacks
entity_register_type("on_off_light", get_attr, set_attr);

// Add với instance_data
entity_add("light_1", "on_off_light", "LED", &instance_data);
```

**SAU:**
```c
// Include entity_light.h
#include "entity_light.h"

// Wrapper struct để lưu GPIO info
typedef struct {
    entity_light_t entity;      // Entity struct ở đầu
    gpio_num_t gpio;            // Driver-specific data
    bool invert_logic;
} on_off_light_wrapper_t;

// Helper: Update GPIO khi state thay đổi
static void update_gpio(on_off_light_wrapper_t *wrapper) {
    int level = wrapper->invert_logic 
        ? (!wrapper->entity.state ? 1 : 0)
        : (wrapper->entity.state ? 1 : 0);
    gpio_set_level(wrapper->gpio, level);
}

// Register type (không cần callbacks)
esp_err_t on_off_light_register_type(void) {
    return entity_register_type("on_off_light", ENTITY_TYPE_LIGHT);
}

// Add entity
esp_err_t on_off_light_add(const on_off_light_config_t *config) {
    // Allocate wrapper
    on_off_light_wrapper_t *wrapper = malloc(sizeof(on_off_light_wrapper_t));
    
    // Fill entity struct
    strncpy(wrapper->entity.base.entity_id, config->entity_id, 15);
    strncpy(wrapper->entity.base.name, config->name, 31);
    wrapper->entity.base.type = ENTITY_TYPE_LIGHT;
    strncpy(wrapper->entity.base.device_class, "on_off", 15);
    wrapper->entity.base.available = true;
    wrapper->entity.base.last_update = time(NULL);
    
    wrapper->entity.state = config->initial_state;
    wrapper->entity.brightness = 100;
    wrapper->entity.mode = LIGHT_MODE_ON_OFF;
    
    // Driver data
    wrapper->gpio = config->gpio;
    wrapper->invert_logic = config->invert_logic;
    
    // Add to model
    int ret = entity_add(wrapper, ENTITY_TYPE_LIGHT);
    
    // Setup GPIO
    gpio_set_direction(wrapper->gpio, GPIO_MODE_OUTPUT);
    update_gpio(wrapper);
    
    return (ret == 0) ? ESP_OK : ESP_FAIL;
}
```

**Vấn đề GPIO:**
- `entity_light_t` không có GPIO field
- **Giải pháp:** Dùng wrapper struct với `entity_light_t` ở đầu
- Hoặc thêm `void *driver_data` vào `entity_base_t`

---

### **Bước 3: Sửa Entity CoAP Server**

#### 3.1 Sửa `entity_coap_server.c`

**TRƯỚC:**
```c
// Gọi entity_get() để lấy string
char value_buf[64];
entity_get(entity_id, "state", value_buf, sizeof(value_buf));
// Parse string → response
```

**SAU:**
```c
// Get entity struct
void *entity = entity_get_struct(entity_id, &type_enum);
if (!entity) return ESP_ERR_NOT_FOUND;

// Cast và đọc trực tiếp
switch (type_enum) {
    case ENTITY_TYPE_LIGHT: {
        entity_light_t *light = (entity_light_t*)entity;
        // Response từ struct fields
        cJSON_AddBoolToObject(response, "state", light->state);
        cJSON_AddNumberToObject(response, "brightness", light->brightness);
        break;
    }
    // ...
}
```

**Cần thêm helper function:**
```c
// Trong entity_model.h
void* entity_get_struct(const char *entity_id, entity_type_t *type_out);
```

---

### **Bước 4: Sửa Serialization**

#### 4.1 Sửa `entity_serialization.c`

**TRƯỚC:**
```c
// Parse text từ entity_describe()
char desc[512];
entity_describe(desc, sizeof(desc));
// Parse lines...

// Gọi entity_get() để lấy values
entity_get(entity_id, "state", buf, sizeof(buf));
// Convert string → struct → CBOR
```

**SAU:**
```c
// Lấy entity structs trực tiếp
for (int i = 0; i < entity_count; i++) {
    void *entity = get_entity_by_index(i, &type_enum);
    
    switch (type_enum) {
        case ENTITY_TYPE_LIGHT: {
            entity_light_t *light = (entity_light_t*)entity;
            // Serialize trực tiếp từ struct
            serialize_light_cbor(light, buffer);
            break;
        }
        // ...
    }
}
```

**Cần thêm helper functions:**
```c
// Trong entity_model.h
int entity_get_count(void);
void* entity_get_by_index(int index, entity_type_t *type_out);
```

---

### **Bước 5: Sửa Device Registry**

#### 5.1 Sửa `device_registry.c`

**TRƯỚC:**
```c
// Text format
char desc[512];
entity_describe(desc, sizeof(desc));
snprintf(payload, ..., desc);
```

**SAU:**
```c
// Tạo device_model_t
device_model_t device = {0};

// Fill device info
strncpy(device.info.device_id, "living-room-001", 15);
// ...

// Fill entities từ entity model
device.entity_count = entity_get_count();
for (int i = 0; i < device.entity_count; i++) {
    device.entities[i] = entity_get_by_index(i, &device.entity_types[i]);
}

// Serialize device_model_t → CBOR
serialize_device_cbor(&device, buffer, buffer_size);
```

---

### **Bước 6: Thêm Helper Functions**

#### 6.1 Thêm vào `entity_model.h`:

```c
/**
 * Get entity struct pointer by entity_id.
 * Returns pointer to entity struct (entity_light_t*, etc.) or NULL if not found.
 * type_out: Output parameter for entity type.
 */
void* entity_get_struct(const char *entity_id, entity_type_t *type_out);

/**
 * Get total number of entities.
 */
int entity_get_count(void);

/**
 * Get entity struct by index.
 * Returns pointer to entity struct or NULL if index invalid.
 */
void* entity_get_by_index(int index, entity_type_t *type_out);

/**
 * Update entity timestamp.
 */
void entity_update_timestamp(const char *entity_id);

/**
 * Set entity available status.
 */
void entity_set_available(const char *entity_id, bool available);

/**
 * Remove entity.
 * Returns 0 on success, -1 on error.
 */
int entity_remove(const char *entity_id);
```

---

### **Bước 7: Memory Management**

#### 7.1 Allocation Strategy

**Option A: Heap Allocation (Flexible)**
```c
// Driver allocates
on_off_light_wrapper_t *wrapper = malloc(sizeof(on_off_light_wrapper_t));
entity_add(wrapper, ENTITY_TYPE_LIGHT);

// Cleanup khi remove
entity_remove(entity_id);  // Frees memory
```

**Option B: Stack Allocation (Fixed)**
```c
// Pre-allocate trong driver
static on_off_light_wrapper_t s_instances[8];
static int s_count = 0;

on_off_light_wrapper_t *wrapper = &s_instances[s_count++];
entity_add(wrapper, ENTITY_TYPE_LIGHT);
```

**Option C: Hybrid**
- Stack cho fixed entities (lights, switches)
- Heap cho dynamic entities (sensors có thể thêm/xóa)

#### 7.2 Cleanup Functions

```c
/**
 * Cleanup all entities and free memory.
 * Call before shutdown or when resetting model.
 */
void entity_model_cleanup(void);

/**
 * Remove entity and free its memory.
 */
int entity_remove(const char *entity_id);
```

---

### **Bước 8: Update Examples**

#### 8.1 Sửa `examples/light_on_off/main/main.c`

**TRƯỚC:**
```c
entity_model_init();
on_off_light_register_type();
on_off_light_add(&config);
```

**SAU:**
```c
entity_model_init();
on_off_light_register_type();  // Chỉ register type ID
on_off_light_add(&config);     // Tạo struct và add
```

---

## 🔄 Migration Checklist

### Phase 1: Core Model
- [ ] Sửa `entity_model_priv.h` - Update struct definitions
- [ ] Sửa `entity_model.c` - Remove callbacks, add struct-based get/set
- [ ] Thêm helper functions (`entity_get_struct`, etc.)
- [ ] Test core functionality

### Phase 2: Drivers
- [ ] Refactor `on_off_light.c` - Tạo wrapper struct
- [ ] Update `on_off_light_add()` - Tạo `entity_light_t`
- [ ] Test light control

### Phase 3: Components
- [ ] Sửa `entity_coap_server.c` - Đọc từ structs
- [ ] Sửa `entity_serialization.c` - Serialize từ structs
- [ ] Sửa `device_registry.c` - Dùng `device_model_t`
- [ ] Test serialization

### Phase 4: Examples
- [ ] Update `examples/light_on_off/main/main.c`
- [ ] Test end-to-end flow
- [ ] Verify CoAP responses

### Phase 5: Documentation
- [ ] Update API documentation
- [ ] Update examples in spec
- [ ] Add migration notes

---

## ⚠️ Breaking Changes

### API Changes:

1. **`entity_register_type()`**
   - **Trước:** `entity_register_type(type_id, get_cb, set_cb)`
   - **Sau:** `entity_register_type(type_id, type_enum)`
   - **Impact:** Tất cả drivers phải sửa

2. **`entity_add()`**
   - **Trước:** `entity_add(entity_id, type_id, name, instance_data)`
   - **Sau:** `entity_add(entity_struct, type_enum)`
   - **Impact:** Tất cả drivers phải sửa

3. **`entity_get()` / `entity_set()`**
   - **Trước:** Gọi callbacks
   - **Sau:** Đọc/ghi trực tiếp từ structs
   - **Impact:** Internal change, API giữ nguyên

### Code Changes Required:

- **All drivers:** Refactor để tạo structs
- **CoAP server:** Sửa để đọc từ structs
- **Serialization:** Sửa để serialize structs
- **Examples:** Update cách sử dụng

---

## 🎯 Benefits sau Migration

1. **Type Safety:** Compiler check types, không cần runtime checks
2. **Performance:** Đọc/ghi trực tiếp, không qua callbacks
3. **Serialization:** Dễ serialize, không cần convert
4. **Spec Compliance:** Match với specification
5. **Maintainability:** Code rõ ràng hơn, dễ debug

---

## 📊 Effort Estimation

| Task | Time Estimate |
|------|---------------|
| Core model refactor | 2-3 hours |
| Driver refactor (per driver) | 1-2 hours |
| Serialization update | 1-2 hours |
| CoAP server update | 1 hour |
| Device registry update | 1 hour |
| Testing & debugging | 2-3 hours |
| **Total** | **8-12 hours** |

---

## 🚀 Migration Order

### Recommended Sequence:

1. **Start với core model** - Foundation phải vững
2. **Migrate một driver** (on_off_light) - Proof of concept
3. **Update serialization** - Test serialize struct
4. **Update CoAP server** - Test API responses
5. **Migrate remaining drivers** - Scale up
6. **Final testing** - End-to-end verification

---

## 💡 Tips & Best Practices

1. **Incremental Migration:**
   - Có thể giữ cả 2 approaches tạm thời
   - Migrate từng driver một
   - Test sau mỗi bước

2. **Wrapper Pattern:**
   - Dùng wrapper struct để lưu driver-specific data
   - `entity_light_t` ở đầu wrapper để dễ cast

3. **Memory Management:**
   - Quyết định allocation strategy trước
   - Document cleanup requirements

4. **Backward Compatibility:**
   - Có thể thêm compatibility layer tạm thời
   - Deprecate old API gradually

---

## 📚 Related Documents

- `IoT_Entity_Model_Specification.md` - Complete specification
- `MODEL_STRUCTURE.md` - Model structure details
- `PROJECT_STRUCTURE.md` - Project organization

---

## ❓ FAQ

**Q: Có thể giữ cả 2 approaches không?**  
A: Có thể, nhưng sẽ phức tạp. Nên chọn một approach chính.

**Q: Driver-specific data (GPIO) lưu ở đâu?**  
A: Dùng wrapper struct hoặc thêm `void *driver_data` vào `entity_base_t`.

**Q: Migration có breaking changes không?**  
A: Có, nhưng có thể làm incremental để giảm impact.

**Q: Performance có tốt hơn không?**  
A: Có, đọc/ghi trực tiếp nhanh hơn callbacks, serialize cũng nhanh hơn.
