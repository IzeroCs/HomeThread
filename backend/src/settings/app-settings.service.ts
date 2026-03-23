/**
 * AppSettings Service - Cài đặt app (thread_run_on_connect, v.v.) — dùng app-settings repo.
 */

import { getAppSetting, setAppSetting } from "@database/repositories/app-settings.repository";

const KEY_THREAD_RUN_ON_CONNECT = "thread_run_on_connect";

export class AppSettingsService {
  getThreadRunOnConnect(): boolean {
    const value = getAppSetting(KEY_THREAD_RUN_ON_CONNECT);
    return value === "1";
  }

  setThreadRunOnConnect(run: boolean): void {
    setAppSetting(KEY_THREAD_RUN_ON_CONNECT, run ? "1" : "0");
  }
}
