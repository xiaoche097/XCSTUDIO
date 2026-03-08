import path from 'path';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const env = loadEnv(process.env.NODE_ENV || 'development', '.', '');

const config = {
  base: '/xc-video/',
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  plugins: [react() as any],
  define: {
    'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    outDir: '../public/xc-video',
    emptyOutDir: true
  }
};

export default config;
