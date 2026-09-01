import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

// Sous-chemin GitHub Pages (https://<user>.github.io/nous-deux/) : VITE_BASE=/nous-deux/
// En local ou sur Vercel/Netlify : laisser vide → "/"
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Estampille de build : deux appareils affichent la même chaîne quand ils
    // font tourner exactement la même version. C'est le seul moyen simple de
    // vérifier, à distance, que deux téléphones sont synchronisés.
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // « prompt » plutôt que « autoUpdate » : le service worker attend au lieu
      // de s'imposer à une page qui fait encore tourner l'ancien code. C'est
      // src/lib/majAuto.ts qui décide du moment de la bascule — jamais au
      // milieu d'une saisie.
      registerType: 'prompt',
      // Le registerSW.js généré ne fait qu'un `register()` sur `load`. Une app
      // installée et reprise depuis le sélecteur ne recharge jamais son
      // document : elle ne redemanderait donc jamais le nouveau sw.js. On
      // enregistre nous-mêmes, dans src/lib/majAuto.ts.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Awy',
        short_name: 'Awy',
        description: 'Un espace intime à deux, peu importe la distance.',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#110F0E',
        theme_color: '#110F0E',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Notifications push : le service worker généré charge nos gestionnaires
        // `push` / `notificationclick` (public/push-sw.js). Le chemin suit la base
        // de déploiement — « /nous-deux/push-sw.js » sur GitHub Pages.
        importScripts: [`${base}push-sw.js`],
        // L'app shell est mis en cache ; les appels Supabase ne le sont JAMAIS (données privées, temps réel)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        // En mode « prompt », le nouveau service worker attend notre feu vert.
        // `clientsClaim` sert seulement à ce que la toute première version
        // prenne la main sur la page déjà ouverte.
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('date-fns')) return 'date-fns'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          }
        },
      },
    },
  },
})
