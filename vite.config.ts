import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
      },
      "/exams": "http://localhost:3001"
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
