/**
 * OtbrRestClient - Giao tiếp với otbr-agent qua REST API (OTBR_REST=ON, port 8081).
 * Path theo OpenAPI ot-br-posix: kebab-case + suffix (/node/state, /node/dataset/active, ...).
 */

import type { OtConfig } from "./ot-config.manager";
import type { TableData } from "./thread-data.manager";

const DEFAULT_BASE_URL = "http://127.0.0.1:8081";

const ROLE_TO_STATE: Record<string, string> = {
  leader: "leader",
  router: "router",
  child: "child",
  detached: "detached",
  disabled: "disabled",
};

export type OtbrResult = { ack: boolean; errorCode?: number };

export class OtbrRestClient {
  private baseUrl: string;
  private connected = false;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = (options?.baseUrl ?? process.env.OTBR_REST_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { parseJson?: boolean; parseText?: boolean }
  ): Promise<{ ok: boolean; status: number; data?: T; text?: string }> {
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      const parseJson = init?.parseJson !== false && res.headers.get("content-type")?.includes("application/json");
      const parseText = init?.parseText === true;
      let data: T | undefined;
      let text: string | undefined;
      const body = await res.text();
      if (parseJson && body) {
        try {
          data = JSON.parse(body) as T;
        } catch {
          text = body;
        }
      } else {
        text = body;
      }
      return { ok: res.ok, status: res.status, data, text };
    } catch (e) {
      return { ok: false, status: 0, text: (e as Error)?.message };
    }
  }

  async isAvailable(): Promise<boolean> {
    const res = await this.request<string>("/node/state", { parseText: true });
    if (res.ok && res.text != null) {
      this.connected = true;
      return true;
    }
    this.connected = false;
    return false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getState(): Promise<{ running: boolean; state: string } | null> {
    const res = await this.request<string>("/node/state", { parseText: true });
    if (!res.ok || res.text == null) return null;
    const raw = String(res.text).trim().toLowerCase();
    const state = ROLE_TO_STATE[raw] ?? raw;
    const running = state !== "disabled" && state !== "detached";
    return { running, state };
  }

  async getActiveDataset(): Promise<OtConfig | null> {
    const res = await this.request<unknown>("/node/dataset/active", {
      headers: { Accept: "text/plain" },
      parseJson: false,
    });
    const raw = res.text ?? (typeof res.data === "string" ? res.data : null);
    if (!res.ok || !raw) return null;
    const hex = typeof raw === "string" ? raw.replace(/[^0-9a-fA-F]/g, "") : "";
    if (!hex) return null;
    return this.datasetHexToOtConfig(hex);
  }

  async attach(): Promise<OtbrResult> {
    const res = await this.request("/node/state", {
      method: "PUT",
      body: JSON.stringify("enable"),
      headers: { "Content-Type": "application/json" },
    });
    return res.ok ? { ack: true } : { ack: false, errorCode: 0x03 };
  }

  async detach(): Promise<OtbrResult> {
    const res = await this.request("/node/state", {
      method: "PUT",
      body: JSON.stringify("disable"),
      headers: { "Content-Type": "application/json" },
    });
    return res.ok ? { ack: true } : { ack: false, errorCode: 0x03 };
  }

  async permitUnsecureJoin(_expirationSeconds: number): Promise<OtbrResult> {
    return { ack: false, errorCode: 0x01 };
  }

  async addJoiner(eui64: string, pskd: string, timeoutSeconds: number): Promise<OtbrResult> {
    const commissionerRes = await this.request("/node/commissioner/state", { parseText: true });
    if (!commissionerRes.ok || commissionerRes.text?.trim().toLowerCase() !== "active") {
      const putRes = await this.request("/node/commissioner/state", {
        method: "PUT",
        body: JSON.stringify("enable"),
        headers: { "Content-Type": "application/json" },
      });
      if (!putRes.ok) return { ack: false, errorCode: 0x03 };
    }
    const eui64Hex = eui64.replace(/[^0-9a-fA-F]/g, "").padStart(16, "0").slice(-16).toLowerCase();
    const res = await this.request("/node/commissioner/joiner", {
      method: "POST",
      body: JSON.stringify({ eui64: eui64Hex, pskd, timeout: timeoutSeconds }),
    });
    return res.ok ? { ack: true } : { ack: false, errorCode: 0x03 };
  }

  async getRouterTable(): Promise<TableData> {
    const res = await this.request<{ data?: Array<{ attributes?: { role?: string; rloc16?: string; extAddress?: string } }> }>("/api/devices", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok || !res.data?.data) return { headers: ["RouterId", "RLOC16", "ExtAddress", "LinkQualityIn", "LinkQualityOut", "Age"], rows: [], error: res.text ?? "REST error" };
    const routers = (res.data.data ?? []).filter((d) => d.attributes?.role === "router" || d.attributes?.role === "leader");
    const rows = routers.map((d) => [
      "-",
      d.attributes?.rloc16 ?? "-",
      d.attributes?.extAddress ?? "-",
      "-",
      "-",
      "-",
    ]);
    return { headers: ["RouterId", "RLOC16", "ExtAddress", "LinkQualityIn", "LinkQualityOut", "Age"], rows };
  }

  async getChildTable(): Promise<TableData> {
    const res = await this.request<{ data?: Array<{ attributes?: { role?: string; rloc16?: string; extAddress?: string } }> }>("/api/devices", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok || !res.data?.data) return { headers: ["ChildId", "RLOC16", "ExtAddress", "LinkQualityIn", "AverageRssi", "FullThreadDevice", "RxOnWhenIdle", "Age"], rows: [], error: res.text ?? "REST error" };
    const children = (res.data.data ?? []).filter((d) => d.attributes?.role === "child");
    const rows = children.map((d) => [
      "-",
      d.attributes?.rloc16 ?? "-",
      d.attributes?.extAddress ?? "-",
      "-",
      "-",
      "-",
      "-",
      "-",
    ]);
    return { headers: ["ChildId", "RLOC16", "ExtAddress", "LinkQualityIn", "AverageRssi", "FullThreadDevice", "RxOnWhenIdle", "Age"], rows };
  }

  async getJoinerTable(): Promise<TableData> {
    const res = await this.request<Array<{ eui64?: string; joinerId?: string; pskd?: string; timeout?: number }>>("/node/commissioner/joiner", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { headers: ["Type", "SharedId", "PSKD", "Expiration"], rows: [], error: res.text ?? "REST error" };
    const arr = Array.isArray(res.data) ? res.data : [];
    const rows = arr.map((j) => [
      j.eui64 ? "eui64" : "id",
      j.eui64 ?? j.joinerId ?? "-",
      j.pskd ?? "-",
      String(j.timeout ?? 0),
    ]);
    return { headers: ["Type", "SharedId", "PSKD", "Expiration"], rows };
  }

  async setActiveDataset(hexTlvs: string): Promise<OtbrResult> {
    const hex = hexTlvs.replace(/[^0-9a-fA-F]/g, "");
    const res = await this.request("/node/dataset/active", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: hex,
    });
    return res.ok ? { ack: true } : { ack: false, errorCode: 0x03 };
  }

  async reset(): Promise<OtbrResult> {
    return { ack: false, errorCode: 0x01 };
  }

  async factoryReset(): Promise<OtbrResult> {
    const res = await this.request("/node", { method: "DELETE" });
    return res.ok ? { ack: true } : { ack: false, errorCode: 0x03 };
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  private datasetHexToOtConfig(hex: string): OtConfig {
    const cfg: OtConfig = {};
    if (!hex || typeof hex !== "string") return cfg;
    try {
      const buf = Buffer.from(hex, "hex");
      let offset = 0;
      while (offset + 2 <= buf.length) {
        const type = buf[offset]!;
        const len = buf[offset + 1]!;
        offset += 2;
        if (offset + len > buf.length) break;
        const val = buf.subarray(offset, offset + len);
        offset += len;
        if (type === 0x01 && len === 2) cfg.panid = "0x" + val.toString("hex");
        if (type === 0x00 && len >= 3) cfg.channel = val.readUInt16BE(1);
        if (type === 0x03) cfg.networkName = val.toString("utf8").replace(/\0/g, "").trim();
        if (type === 0x02 && len === 8) cfg.extendedPanId = val.toString("hex");
        if (type === 0x05 && len === 16) cfg.networkKey = val.toString("hex");
        if (type === 0x0e && len === 8) cfg.activeTimestamp = val.toString("hex");
      }
    } catch {
      //
    }
    return cfg;
  }
}
