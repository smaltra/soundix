import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/soundix/',
  plugins: [react()],
  test: { include: ['src/core/**/*.test.ts'] },
})
