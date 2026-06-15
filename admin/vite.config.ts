import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

function getBuildMetadata(command: string, fallback: string) {
  try {
    const output = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return output || fallback
  } catch {
    return fallback
  }
}

const gitHash = process.env.GIT_HASH ?? getBuildMetadata('git rev-parse --short HEAD', 'unknown')
const gitDate = process.env.BUILD_DATE ?? getBuildMetadata('git log -1 --format=%cd --date=short', new Date().toISOString().slice(0, 10))
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3401'
const wsProxyTarget = proxyTarget.replace(/^http/i, 'ws')
const port = Number.parseInt(process.env.VITE_PORT ?? '3402', 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_HASH__: JSON.stringify(gitHash),
    __BUILD_DATE__: JSON.stringify(gitDate),
  },
  server: {
    host: process.env.VITE_HOST ?? '0.0.0.0',
    port: Number.isNaN(port) ? 3402 : port,
    strictPort: true,
    proxy: {
      '/api': proxyTarget,
      '/storage': proxyTarget,
      '/display': proxyTarget,
      '/ws': {
        target: wsProxyTarget,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
