import path from "node:path";
import { getOrCreateEnvStyleSecret, logger } from "@namorix/core-backend";

const secretLog = logger.child("AddonSecret");
const SECRET_FILE = ".addon-secrets";
const SECRET_KEY = "ADDON_REGISTRATION_SECRET";

export function getAddonRegistrationSecret(): string {
  return getOrCreateEnvStyleSecret({
    databaseModuleDir: path.join(__dirname, "database"),
    fileName: SECRET_FILE,
    keyName: SECRET_KEY,
    bytes: 64,
    onGenerated: (secretPath) => secretLog.info(`addon registration secret generated ${secretPath}`),
  });
}
