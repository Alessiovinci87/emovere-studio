import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

// `vite --mode devapi` (npm run dev:server): /api va al server di prova locale (scripts/dev-api.mjs),
// con il login simulato al posto di Supabase Auth
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    ...(mode === 'devapi' ? { 'import.meta.env.VITE_DEV_API': JSON.stringify('1') } : {}),
  },
  server: mode === 'devapi' ? { proxy: { '/api': `http://localhost:${process.env.DEV_API_PORT ?? 8787}` } } : undefined,
}))
