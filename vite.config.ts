import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Baca baik VITE_* maupun NEXT_PUBLIC_* (yang ditambahkan otomatis saat klik "Connect project" pada integrasi Supabase <-> Vercel,
  // tanpa mengekspos secret server seperti SUPABASE_SERVICE_ROLE_KEY atau POSTGRES_PASSWORD ke bundle browser).
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
