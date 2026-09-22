/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
      "192.0.0.2",
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
