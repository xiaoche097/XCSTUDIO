import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const geminiKey = env.VITE_GEMINI_API_KEY || "";
  return {
    base: "/", // 确保基础路径正确
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    build: {
      outDir: "dist",
      assetsDir: "assets",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "ui-vendor": ["lucide-react", "framer-motion"],
          },
        },
      },
    },
    // define block restored to support legacy process.env usage
    define: {
      "process.env": {
        API_KEY: geminiKey,
        GEMINI_API_KEY: geminiKey,
        VITE_GEMINI_API_KEY: geminiKey,
        NODE_ENV: mode,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
      dedupe: ["react", "react-dom"],
    },
  };
});
