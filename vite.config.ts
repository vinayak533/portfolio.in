import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), glsl({ minify: command === 'build' })],
  // OneDrive turns node_modules files into reparse points; without this the
  // Rolldown resolver treats them as broken symlinks and fails to resolve deps.
  resolve: { preserveSymlinks: true },
  server: { port: 5199, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
}))
