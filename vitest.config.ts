import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    // Chaque test de composant rend une composition entière, soit près de mille
    // éléments `text` insérés dans jsdom, et il en rend souvent deux pour comparer
    // avant et après. C'est un vrai travail, pas une lenteur accidentelle : les
    // cinq secondes par défaut suffisent à un fichier lancé seul, mais pas quand
    // toute la suite tourne en parallèle.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/platform/**'],
      // Sans ça, les fichiers entièrement couverts disparaissent du tableau et
      // on croit à tort qu'ils ne sont pas testés.
      skipFull: false,
      // Table générée, sans logique : la couvrir ne mesurerait rien.
      exclude: ['src/lib/fonts.ts'],
    },
  },
})
