/**
 * BrConnectionConfigService - Cấu hình BR (TCP) lưu trong app_settings (br_host, br_port, use_mdns).
 */

import { getAppSetting, setAppSetting } from "@database/repositories/app-settings.repository";
import type { BrConnectionConfig } from "shared/src/types";
import { BR_CONNECTION } from "shared/src/constants";

export type { BrConnectionConfig };

const KEY_BR_HOST = "br_host";
const KEY_BR_PORT = "br_port";
const KEY_USE_MDNS = "use_mdns";

export class BrConnectionConfigService {
  getLatest(): BrConnectionConfig | null {
    const brHost = getAppSetting(KEY_BR_HOST);
    const brPort = getAppSetting(KEY_BR_PORT);
    const useMdns = getAppSetting(KEY_USE_MDNS);
    if (brHost == null || brPort == null || useMdns == null) return null;
    return {
      brHost,
      brPort: Number(brPort),
      useMdns: useMdns === "1",
    };
  }

  getById(_id: number): BrConnectionConfig | null {
    return this.getLatest();
  }

  create(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    this.saveOrUpdate(config);
    const created = this.getLatest();
    if (!created) throw new Error("Failed to read created config");
    return created;
  }

  update(
    _id: number,
    config: Partial<Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">>
  ): BrConnectionConfig | null {
    const current = this.getLatest();
    if (!current) return null;
    this.saveOrUpdate({
      brHost: config.brHost ?? current.brHost,
      brPort: config.brPort ?? current.brPort,
      useMdns: config.useMdns ?? current.useMdns,
    });
    return this.getLatest();
  }

  delete(_id: number): boolean {
    setAppSetting(KEY_BR_HOST, "192.168.31.3");
    setAppSetting(KEY_BR_PORT, String(BR_CONNECTION.DEFAULT_PORT));
    setAppSetting(KEY_USE_MDNS, "0");
    return true;
  }

  getAll(): BrConnectionConfig[] {
    const one = this.getLatest();
    return one ? [one] : [];
  }

  hasConfig(): boolean {
    return this.getLatest() != null;
  }

  saveOrUpdate(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    const port = config.brPort ?? BR_CONNECTION.DEFAULT_PORT;
    const useMdns = config.useMdns ?? false;
    setAppSetting(KEY_BR_HOST, config.brHost.trim());
    setAppSetting(KEY_BR_PORT, String(port));
    setAppSetting(KEY_USE_MDNS, useMdns ? "1" : "0");
    const result = this.getLatest();
    if (!result) throw new Error("Failed to read saved config");
    return result;
  }
}
