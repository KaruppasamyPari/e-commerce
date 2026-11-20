import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api": e.API_ORIGIN || "http://127.0.0.1:8080",
    "/media": e.API_ORIGIN || "http://127.0.0.1:8080",
  };
  return {
    plugins: [react()],
    server: { proxy, strictPort: true },
    preview: { proxy, strictPort: true },
  };
});
