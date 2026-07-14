import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app talks ONLY to the Node API (never the Python engine directly).
// In dev, /api is proxied to the Node backend. In prod the build is served from
// the same origin as the API, so relative /api paths just work.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
