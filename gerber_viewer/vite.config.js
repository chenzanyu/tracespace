import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Ensure workspace packages prefer their source entry during dev
  resolve: {
    conditions: ['source'],
  },
})
