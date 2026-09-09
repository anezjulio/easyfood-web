import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { installApi } from "./server/api";

const DEV_SERVER_PORT = parsePort(process.env.PORT, 5173);
const PREVIEW_PORT = parsePort(process.env.PORT, 4173);
const ALLOWED_HOSTS = resolveAllowedHosts();
const JS_COMPAT_TARGET = "es2018";
const CSS_COMPAT_TARGET = "chrome80";

function parsePort(input: string | undefined, fallback: number) {
  const parsed = Math.trunc(Number(input));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAllowedHosts() {
  const hosts = new Set<string>();
  const configured = String(process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || "").trim();
  if (configured) {
    for (const value of configured.split(",")) {
      const host = value.trim();
      if (host) hosts.add(host);
    }
  }

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railwayDomain) {
    hosts.add(railwayDomain);
  }

  hosts.add("easyfood-web-production.up.railway.app");

  return [...hosts];
}

// https://vite.dev/config/
export default defineConfig({
  esbuild: {
    target: JS_COMPAT_TARGET,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: JS_COMPAT_TARGET,
    },
  },
  build: {
    target: JS_COMPAT_TARGET,
    cssTarget: CSS_COMPAT_TARGET,
  },
  server: {
    host: true,
    port: DEV_SERVER_PORT,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
    watch: { ignored: ["**/mock-api/**", "**/images/**"] },
  },
  preview: {
    host: true,
    port: PREVIEW_PORT,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
  plugins: [react(), {
    name: "app-api",
    configureServer: (server) => { installApi(server.middlewares); },
    configurePreviewServer: (server) => { installApi(server.middlewares); },
  }],
});
