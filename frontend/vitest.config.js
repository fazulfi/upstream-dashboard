import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: [
        'src/App.jsx',
        'src/components/LoginGate.jsx',
        'src/components/Layout.jsx',
        'src/components/Sidebar.jsx',
        'src/pages/Reliability.jsx',
        'src/hooks/**/*.{js,jsx}',
        'src/lib/**/*.{js,jsx}',
      ],
      exclude: ['src/main.jsx', 'src/theme.jsx'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})