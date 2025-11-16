import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const fromWorkspace = (relativePath) =>
  fileURLToPath(new URL(relativePath, import.meta.url))


// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Ensure workspace packages prefer their source entry during dev
  resolve: {
    conditions: ['source'],
    alias: {
      '@tracespace/hybrid-core': fromWorkspace('../packages/hybrid-core/src/index.ts'),
      '@tracespace/legacy-core': fromWorkspace('../packages/legacy_core/src/index.ts'),
    },
  },
})
