import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // dev only: allow cloudflared/ngrok tunnels to reach Vite without per-URL whitelisting
    allowedHosts: true,
    // proxy API calls so the Mini App can reach the backend over the same HTTPS tunnel
    // (avoids browser mixed-content blocking when page is served via cloudflared HTTPS)
    // Order matters: more specific (/api/socket.io) must come before generic /api.
    proxy: {
      "/api/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
