/*
 * Dataset init: khi boot kiểm tra active dataset; nếu không có thì tạo mới và commit.
 */

#ifndef OPENTHREAD_DATASET_INIT_H
#define OPENTHREAD_DATASET_INIT_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Gọi sau khi esp_openthread_start() xong.
 * Kiểm tra active dataset (otDatasetGetActiveTlvs); nếu không có hoặc lỗi thì
 * tạo dataset mới (otDatasetCreateNewNetwork), set active và commit vào NVS.
 */
void openthread_dataset_init_on_boot(void);

#ifdef __cplusplus
}
#endif

#endif /* OPENTHREAD_DATASET_INIT_H */
