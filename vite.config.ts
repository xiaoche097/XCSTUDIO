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
    esbuild: {
      drop: mode === "production" ? ["console", "debugger"] : [],
    },
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
    define: {
      "process.env.API_KEY": JSON.stringify(geminiKey),
      "process.env.GEMINI_API_KEY": JSON.stringify(geminiKey),
      "process.env.VITE_GEMINI_API_KEY": JSON.stringify(geminiKey),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
      dedupe: ["react", "react-dom"],
    },
  };
});
