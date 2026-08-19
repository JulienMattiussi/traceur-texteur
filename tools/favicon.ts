/**
 * Régénère `public/favicon.svg` depuis `src/lib/logo.ts`.
 *
 * Un favicon est servi tel quel : il ne peut ni importer de module ni exécuter de
 * calcul. Le recopier à la main revenait à entretenir deux versions de la marque,
 * et la deuxième dérivait dès la première retouche. Ici il n'y a qu'une source.
 *
 *   make favicon
 */
import { writeFileSync } from 'node:fs'
import { LOGO_BOX, LOGO_GLYPHS, LOGO_SPIRAL, logoGlyphTransform } from '../src/lib/logo.ts'

const INK = '#5eead4'
const BACKGROUND = '#0f172a'

const marks = LOGO_GLYPHS.map(
  (glyph) =>
    `    <text transform="${logoGlyphTransform(glyph)}" font-size="${glyph.size.toFixed(2)}">${glyph.char}</text>`,
).join('\n')

const svg = `<!-- Généré par \`make favicon\` depuis src/lib/logo.ts. Ne pas éditer à la main. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_BOX} ${LOGO_BOX}">
  <rect width="${LOGO_BOX}" height="${LOGO_BOX}" rx="10" fill="${BACKGROUND}"/>
  <polyline points="${LOGO_SPIRAL}" fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.1" stroke-linecap="round"/>
  <g fill="${INK}" font-family="Times, serif" text-anchor="middle">
${marks}
  </g>
</svg>
`

writeFileSync('public/favicon.svg', svg)
console.log(`-> public/favicon.svg (${LOGO_GLYPHS.length} lettres)`)
