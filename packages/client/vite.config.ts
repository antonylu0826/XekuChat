import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    include: ["emoji-mart", "@emoji-mart/react", "@emoji-mart/data"],
  },
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so Docker containers can reach it via host.docker.internal
    allowedHosts: true, // allow any host (tunnels, reverse proxies, etc.)
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
