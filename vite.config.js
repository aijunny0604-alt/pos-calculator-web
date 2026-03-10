import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/pos-calculator-web/',
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' }
  }
})
