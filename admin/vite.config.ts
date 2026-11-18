import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Bağımsız yönetim paneli arayüzü (admin/dist). Geliştirmede /api ve /auth → admin sunucusu (3002).
export default defineConfig({
  root: here('.'),
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss({ config: here('./tailwind.config.js') }), autoprefixer()] } },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3002', '/auth': 'http://localhost:3002' },
    // Ortak bileşenler depo kökündeki src/ altında
    fs: { allow: [here('..')] },
  },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { map: ['leaflet', 'react-leaflet'] } } },
  },
});
