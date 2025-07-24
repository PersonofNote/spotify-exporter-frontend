import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Use 127.0.0.1 instead of localhost for Spotify OAuth
    port: 5173,
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        secure: false,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
        }
      },
      // Only proxy auth/login and auth/exchange, not auth/callback (handled by frontend)
      '/auth/login': {
        target: backend,
        changeOrigin: true,
        secure: false,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
        }
      },
      '/auth/exchange': {
        target: backend,
        changeOrigin: true,
        secure: false,
        headers: {
          'Access-Control-Allow-Credentials': 'true',
        }
      }
    }
  }
})
