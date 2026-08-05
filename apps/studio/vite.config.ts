import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vite config for the studio UI.
// Proxies /api to the local backend service (main/server.js on DF_PORT).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5317,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DF_PORT ?? 7317}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ["main/**/*.test.{js,ts}", "ui/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
