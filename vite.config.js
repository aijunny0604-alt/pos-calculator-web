import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: '/pos-calculator-web/',
  plugins: [
    react(),
    // 구형 Samsung Internet / Android Chrome 호환 — 흰 화면 버그 fix
    // 모던 빌드는 그대로 + 레거시 빌드(SystemJS) 폴리필 자동 주입
    legacy({
      targets: ['defaults', 'Samsung >= 8', 'Android >= 7', 'iOS >= 11'],
      modernPolyfills: true, // 모던 브라우저도 동적 import 안정성 ↑
      renderLegacyChunks: true,
    }),
  ],
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
