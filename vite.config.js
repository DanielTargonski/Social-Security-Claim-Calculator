import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Default to node — math/lib tests don't need a DOM and run faster without
    // one. Component test files opt into jsdom by adding a docblock at the top:
    //   // @vitest-environment jsdom
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
