import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-icons')) return 'icons'
          if (id.includes('recharts')) return 'charts'
          if (id.includes('@firebase') || id.includes('firebase')) return 'firebase'
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router-dom')
          ) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
  },
})
