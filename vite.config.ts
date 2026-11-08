import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, '.', 'TAAMEN_');

  // npm run dev stays a plain Vite SPA.
  // Cloudflare is used for production builds and preview only.
  const useCloudflare = command === 'build' || isPreview === true;

  return {
    plugins: [
      react(),
      ...(useCloudflare ? [cloudflare()] : []),
    ],

    // Allow Cloudflare Quick Tunnel hostnames in Vite Preview.
    preview: {
      allowedHosts: ['.trycloudflare.com'],
    },

    server: useCloudflare
      ? undefined
      : {
          proxy: {
            '/api': {
              target: env.TAAMEN_BACKEND_ORIGIN || 'http://localhost:8787',
              changeOrigin: false,
            },
          },
        },
  };
});