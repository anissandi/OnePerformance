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

  // Pre-bundle every runtime dependency up front. Without this, Vite discovers
  // lazily-imported deps (e.g. Radix UI) at runtime and re-optimizes, which can
  // leave the page with two React chunks -> "Invalid hook call / reading 'useState'".
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router',
      'lucide-react',
      'sonner',
      'recharts',
      'motion/react',
      'xlsx',
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'cmdk',
      'vaul',
      'input-otp',
      'next-themes',
      'embla-carousel-react',
      'react-day-picker',
      'react-hook-form',
      'react-resizable-panels',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
    ],
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
