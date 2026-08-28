import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/entity-relationships/' : '/',
  server: {
    allowedHosts: ['alam.tailf325ec.ts.net'],
  },
})
