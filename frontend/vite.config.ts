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
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
