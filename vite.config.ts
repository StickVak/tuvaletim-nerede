import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = { target: 'http://localhost:3001', xfwd: true };
// Hizmet Şartları / Gizlilik Politikası sunucuda üretilir (server/legal.js)
const devProxy = { '/api': api, '/gizlilik-politikasi': api, '/hizmet-sartlari': api, '/privacy': api, '/terms': api };

export default defineConfig({
  plugins: [react()],
  // Express API (server/index.js, port 3001)
  // xfwd: gerçek istemci IP'si X-Forwarded-For ile iletilir (sunucudaki hız sınırı IP başına çalışsın)
  server: { proxy: devProxy },
  preview: { proxy: devProxy },
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
