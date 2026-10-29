import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser calls /v1 on this origin and Vite forwards it to the api,
    // so the session cookie is first-party and no CORS is needed.
    // API_PROXY_TARGET is http://api:3000 inside Docker Compose.
    proxy: {
      "/v1": process.env.API_PROXY_TARGET ?? "http://localhost:3000",
    },
  },
});
