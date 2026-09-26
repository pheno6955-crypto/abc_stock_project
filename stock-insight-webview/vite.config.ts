/// <reference types="vitest/config" />
import os from "node:os";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 팀원 노트북에서 실제 LAN IP로 접속할 때 Vite가 막지 않도록, 이 PC의 현재 IP들을 자동으로 허용 목록에 추가.
// (하드코딩된 IP는 네트워크가 바뀌면 곧바로 틀린 값이 되어 접속이 막히는 문제가 있었음)
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface): iface is NonNullable<typeof iface> => !!iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [
      "enticing-evidence-uncivil.ngrok-free.dev",
      "localhost",
      ...lanAddresses,
    ],
    fs: {
      strict: false,
    },
    watch: {
      usePolling: true,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
  },
});
