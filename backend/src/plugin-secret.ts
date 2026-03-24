import path from "node:path";
import { getOrCreateEnvStyleSecret, logger } from "@namorix/core-backend";

const secretLog = logger.child("PluginSecret");
const SECRET_FILE = ".plugin-secrets";
const SECRET_KEY = "PLUGIN_REGISTRATION_SECRET";

export function getPluginRegistrationSecret(): string {
  return getOrCreateEnvStyleSecret({
    databaseModuleDir: path.join(__dirname, "database"),
    fileName: SECRET_FILE,
    keyName: SECRET_KEY,
    bytes: 64,
    onGenerated: (secretPath) => secretLog.info(`plugin registration secret generated ${secretPath}`),
  });
}

