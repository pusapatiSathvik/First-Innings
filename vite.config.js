import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.js', css: true, include: ['src/**/*.test.{js,jsx}'] },
  build: { rollupOptions: { output: { manualChunks: { 'vendor-react': ['react', 'react-dom', 'react-router-dom'], 'vendor-supabase': ['@supabase/supabase-js'], 'vendor-icons': ['lucide-react'] } } } },
})
