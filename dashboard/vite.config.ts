import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/marketplace': 'http://localhost:8080',
      '/agents': 'http://localhost:8080',
      '/ai': 'http://localhost:8080',
      '/stream': 'http://localhost:8080',
      '/proof': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/metrics': 'http://localhost:8080',
      '/api/vera': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})
