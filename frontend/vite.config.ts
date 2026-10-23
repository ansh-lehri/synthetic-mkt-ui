import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Generated + hand-authored contract types live outside frontend/ (contract/generated/ts).
const contractTs = fileURLToPath(new URL('../contract/generated/ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@contract': contractTs },
  },
  server: {
    // contract/generated/ts is outside the frontend root
    fs: { allow: ['..'] },
    // TEMPORARY dev-only CORS workaround: the real backend (localhost:8080) sends no
    // CORS headers and never will for a browser-origin request. Proxying same-origin
    // through Vite sidesteps that without any backend change. Remove once the backend
    // serves CORS headers itself (or sits behind a same-origin gateway in every
    // deployment). With this proxy active, set VITE_API_BASE="" and
    // VITE_WS_BASE="ws://localhost:5173" in frontend/.env so requests go through it.
    proxy: {
      '/v1': { target: 'http://localhost:8000', changeOrigin: true, ws: true },
      '/session': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
