import {defineConfig} from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/index.ts',
      name: 'tracespace-hybrid-core',
      fileName: 'tracespace-hybrid-core',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [
        '@tracespace/core',
        '@tracespace/legacy-core',
        '@tracespace/parser',
        '@tracespace/xml-id',
        '@tracespace/identify-layers',
      ],
    },
  },
  plugins: [dts()],
})
