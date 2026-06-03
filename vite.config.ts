import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.API_PORT ?? "3001";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": {
        target: apiTarget,
        ws: true
      },
      "/exams": apiTarget
    },
    fs: {
      allow: [".."]
    }
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true
  }
});
