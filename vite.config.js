import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/pos-calculator-web/',
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' }
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // 결제 관리 전용 (지연 로드 대상)
          'exceljs': ['exceljs'],
          'html-to-image': ['html-to-image'],
          // 모니터링 (결제와 무관하게 필요)
          'sentry': ['@sentry/react'],
          // Supabase 클라이언트
          'supabase-js': ['@supabase/supabase-js'],
          // React 생태계 (공통)
          'react-core': ['react', 'react-dom'],
        }
      }
    }
  }
})
