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
  build: {
    rolldownOptions: {
      output: {
        // Keep third-party code (React, React Flow, dagre) in its own long-cached chunk.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'flow', test: /node_modules[\\/](@xyflow|@dagrejs|d3-[a-z-]+|classcat|zustand)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['{src,server,shared}/**/*.test.{ts,tsx}'],
  },
})
