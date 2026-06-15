import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base: '/display/',
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'events', 'util', 'stream', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3403,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3401',
      '/storage': 'http://localhost:3401',
      '/demo-media': 'http://localhost:3401',
      '/ws': {
        target: 'ws://localhost:3401',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: 'terser',
    terserOptions: {
      ecma: 2020,
    },
  },
})
