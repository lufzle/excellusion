import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/excellusion/' : '/',
  server: { port: 3003 },
  plugins: [
    tailwindcss(),
    tsConfigPaths(),
    viteReact(),
  ],
})
