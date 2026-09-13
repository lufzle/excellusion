import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/excellusion/' : '/',
  server: {
    port: 3003,
    proxy: {
      '/chatjimmy-api': {
        target: 'https://chatjimmy.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chatjimmy-api/, ''),
      },
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths(),
    viteReact(),
  ],
})
