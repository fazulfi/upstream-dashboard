import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    coverage: {
      thresholds: {
        functions: 0,
        lines: 0,
        branches: 0,
        statements: 0
      }
    }
  },
  server: {
    proxy: {
      // Dev proxy: /api -> backend Flask (127.0.0.1:8124)
      '/api': {
        target: 'http://127.0.0.1:8124',
        changeOrigin: true,
      },
    },
  },
})
