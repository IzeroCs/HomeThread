/**
 * Lib build for Namorix Desktop: single ES module + one CSS file.
 * Run: npm run build:plugin | npm run build:plugin:watch
 */
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
const siblingReposRoot = resolve(__dirname, "../../..");
const namorixCoreSrc = resolve(siblingReposRoot, "namorix/core/frontend/src");
const namorixCoreSharedSrc = resolve(
  siblingReposRoot,
  "namorix/core/shared/src/index.ts",
);
const namorixAssetsRoot = resolve(siblingReposRoot, "namorix-assets");

/** Output: dashboard/dist/plugin/assets/thread.js + thread.css */
const outDir = resolve(__dirname, "../dist/plugin");

/** Same idea as Desktop `coreExternalForBuild`: leave bare `@namorix/core*` + resolved src paths out of the bundle (importmap on host). */
function pluginCoreExternal(id: string): boolean {
  const n = id.split("?")[0].replace(/\\/g, "/");
  if (/\.(scss|sass|css)$/.test(n)) return false;
  if (id === "@namorix/core/styles" || id.startsWith("@namorix/core/styles/")) {
    return false;
  }
  if (/^@namorix\/core($|\/)/.test(id)) return true;
  if (n.includes("/namorix/core/frontend/src/")) return true;
  if (n.includes("/namorix/core/shared/")) return true;
  return false;
}

/** Deep `@namorix/core/components/...` → external `@namorix/core/components` so host importmap stays small. */
function canonicalizeCoreComponentsImportsPlugin(): Plugin {
  return {
    name: "canonicalize-core-components-imports",
    enforce: "pre",
    resolveId(id) {
      if (
        id.startsWith("@namorix/core/components/") &&
        id !== "@namorix/core/components"
      ) {
        return { id: "@namorix/core/components", external: true };
      }
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [canonicalizeCoreComponentsImportsPlugin()],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true },
    },
  },
  resolve: {
    alias: [
      { find: "@namorix/core/styles", replacement: resolve(namorixCoreSrc, "styles") },
      { find: "@namorix/core/ws", replacement: resolve(namorixCoreSrc, "ws/index.ts") },
      { find: "@namorix/core/shell-api", replacement: resolve(namorixCoreSrc, "shell-api/index.ts") },
      { find: "@namorix/core/store", replacement: resolve(namorixCoreSrc, "store/index.ts") },
      {
        find: "@namorix/core/components",
        replacement: resolve(namorixCoreSrc, "components"),
      },
      { find: "@namorix/core/i18n", replacement: resolve(namorixCoreSrc, "i18n/index.ts") },
      { find: "@namorix/core", replacement: resolve(namorixCoreSrc, "index.ts") },
      { find: "@namorix/core-shared", replacement: namorixCoreSharedSrc },
      { find: "@namorix/assets", replacement: namorixAssetsRoot },
      { find: "@", replacement: resolve(__dirname, "src") },
      { find: "@core", replacement: resolve(__dirname, "src/core") },
      { find: "@features", replacement: resolve(__dirname, "src/features") },
      { find: "@shared", replacement: resolve(__dirname, "src/shared") },
      { find: "@network", replacement: resolve(__dirname, "src/features/network") },
      { find: "@settings", replacement: resolve(__dirname, "src/features/settings") },
      { find: "@styles", replacement: resolve(__dirname, "src/styles") },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [
          resolve(__dirname, "src"),
          resolve(__dirname, "../shared/src"),
          namorixCoreSrc,
        ],
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0"),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    cssCodeSplit: false,
    outDir,
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      formats: ["es"],
      fileName: "assets/thread",
    },
    rollupOptions: {
      external: pluginCoreExternal,
      output: {
        /** Prefer one CSS file; other emitted assets keep hashed names */
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          if (typeof name === "string" && name.endsWith(".css")) {
            return "assets/thread.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
