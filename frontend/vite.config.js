import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
    cors: true,
    proxy: {
      // Proxy /api/* → the deployed Azure FastAPI backend. The browser only
      // ever talks to the Vite dev server (same-origin), so no CORS is
      // involved and the deployed backend needs no localhost origins.
      '/api': {
        target: 'https://intellitraffic-api.victorioushill-8638d798.uaenorth.azurecontainerapps.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 5173,
    host: '127.0.0.1',
  },
});
