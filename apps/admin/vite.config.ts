import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // apps/web already owns 5173.
    // 5174 clashes with storybook on my machine — am
    port: 5174,
    // Same-origin /v1 via Vite's proxy, as in apps/web. API_PROXY_TARGET is
    // http://api:3000 inside Docker Compose.
    proxy: {
      // xfwd: the API rate-limits per client IP, and without X-Forwarded-For
      // every operator would look like this one proxy.
      "/v1": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", xfwd: true },
    },
  },
});
