import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Express API (server/index.js, port 3001)
  // xfwd: gerçek istemci IP'si X-Forwarded-For ile iletilir (sunucudaki hız sınırı IP başına çalışsın)
  server: { proxy: { '/api': { target: 'http://localhost:3001', xfwd: true } } },
  preview: { proxy: { '/api': { target: 'http://localhost:3001', xfwd: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          map: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
