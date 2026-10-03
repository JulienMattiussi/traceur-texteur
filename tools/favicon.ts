/**
 * Régénère `public/favicon.svg` depuis `src/lib/logo.ts`.
 *
 * Un favicon est servi tel quel : il ne peut ni importer de module ni exécuter de
 * calcul. Le recopier à la main revenait à entretenir deux versions de la marque,
 * et la deuxième dérivait dès la première retouche. Ici il n'y a qu'une source.
 *
 * L'icône est la **spirale seule**, sans le mot que porte la marque du site. Un
 * onglet affiche seize pixels de côté : les cinq lettres y devenaient quatre taches
 * grises, alors que la spirale, elle, se reconnaît. C'est la même figure réduite à
 * ce qui survit, pas une autre marque.
 *
 *   make favicon
 */
import { writeFileSync } from 'node:fs'
import {
  BRAND_BACKGROUND,
  BRAND_INK,
  ICON_SPIRAL,
  ICON_STROKE,
  LOGO_BOX,
  spiralPoints,
} from '@/lib/logo'

const svg = `<!-- Généré par \`make favicon\` depuis src/lib/logo.ts. Ne pas éditer à la main. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_BOX} ${LOGO_BOX}">
  <rect width="${LOGO_BOX}" height="${LOGO_BOX}" rx="10" fill="${BRAND_BACKGROUND}"/>
  <polyline
    points="${spiralPoints(ICON_SPIRAL, 0.08)}"
    fill="none"
    stroke="${BRAND_INK}"
    stroke-width="${ICON_STROKE}"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`

writeFileSync('public/favicon.svg', svg)
console.log(`-> public/favicon.svg (spirale de ${ICON_SPIRAL.turns} tours)`)
