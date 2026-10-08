import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the browser talks to one origin, as it does behind nginx in
// Docker: Vite forwards /api to the API, so the session cookie needs no
// cross-origin setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:3001', changeOrigin: false },
    },
  },
});
