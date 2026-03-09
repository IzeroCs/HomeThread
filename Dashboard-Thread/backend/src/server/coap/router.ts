/**
 * Register CoAP controllers: single server.on("request") that dispatches to decorated handlers.
 */

import type { Server } from "coap";
import { logger } from "../../utils/logger";
import { getCoapRoutes } from "./types";

const coapLog = logger.child("CoAP");

const DEVICE_PATH_PREFIX = "/device/";

function normalizePath(url: string): string {
  const path = (url ?? "").split("?")[0];
  return path.replace(/\/$/, "") || "/";
}

export function registerCoapControllers(
  server: Server,
  controllers: (new (...args: unknown[]) => unknown)[]
): void {
  const instances = controllers.map((Ctor) => new Ctor());
  const routeList: { method: string; path: string; instance: object; propertyKey: string }[] = [];

  for (let i = 0; i < controllers.length; i++) {
    const Ctor = controllers[i];
    const instance = instances[i];
    const routes = getCoapRoutes(Ctor);
    for (const r of routes) {
      routeList.push({
        method: r.method,
        path: r.path,
        instance,
        propertyKey: r.propertyKey,
      });
    }
  }

  server.on("request", (req: { url?: string; method?: string }, res: { statusCode?: string; end: (buf?: Buffer) => void }) => {
    const url = req.url ?? "";
    const method = (req.method ?? "POST").toUpperCase();
    const path = normalizePath(url);

    coapLog.info(`CoAP request ${method} ${url}`);

    if (!path.startsWith(DEVICE_PATH_PREFIX)) {
      coapLog.warn(`CoAP path not accepted: ${url} (expected /device/...)`);
      res.statusCode = "4.04";
      res.end();
      return;
    }

    for (const { method: routeMethod, path: routePath, instance, propertyKey } of routeList) {
      if (routeMethod !== method || path !== routePath) continue;

      const handler = (instance as Record<string, (req: unknown, res: unknown) => void>)[propertyKey];
      if (typeof handler !== "function") continue;

      try {
        const result = handler.call(instance, req, res);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            res.statusCode = "5.00";
            res.end();
            console.error(`CoAP ${method} ${path} handler error:`, err);
          });
        }
      } catch (err) {
        res.statusCode = "5.00";
        res.end();
        console.error(`CoAP ${method} ${path} handler error:`, err);
      }
      return;
    }

    res.statusCode = "4.04";
    res.end();
  });
}
