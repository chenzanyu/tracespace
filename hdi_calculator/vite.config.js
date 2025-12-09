import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const isLibraryBuild = mode === 'lib'

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 4174,
    },
    build: isLibraryBuild
      ? {
          lib: {
            entry: resolve(__dirname, 'src/lib.js'),
            name: 'StackPreview',
            fileName: format => `stack-preview.${format}.js`,
            formats: ['es', 'umd'],
          },
          rollupOptions: {
            external: ['vue'],
            output: {
              globals: {
                vue: 'Vue',
              },
              exports: 'named',
            },
          },
        }
      : undefined,
  }
})
