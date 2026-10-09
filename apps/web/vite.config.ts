import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In development the browser talks to one origin, as it does behind nginx in
// Docker: Vite forwards /api to the API, so the session cookie needs no
// cross-origin setup.
export default defineConfig(({ mode }) => {
  // API_URL from the shell or from .env.local; it is not exposed to the client.
  const apiUrl = loadEnv(mode, process.cwd(), 'API_').API_URL ?? 'http://localhost:3001';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: apiUrl, changeOrigin: false },
      },
    },
  };
});
