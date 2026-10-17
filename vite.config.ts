/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.PORT ?? '8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
  test: {
    include: ['{src,server,shared}/**/*.test.{ts,tsx}'],
  },
})
