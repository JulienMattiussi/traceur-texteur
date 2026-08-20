/**
 * Régénère `public/og.png`, l'image que les réseaux sociaux affichent.
 *
 * Ce n'est pas une maquette : la spirale est une **vraie composition**, calculée par
 * le moteur avec les mêmes réglages que l'application. Une image dessinée à la main
 * finirait par promettre autre chose que ce que le produit fait, et personne ne s'en
 * apercevrait avant longtemps.
 *
 * Le titre est posé à côté plutôt que par-dessus : une vignette de partage est
 * souvent affichée sur trois cents pixels de large, où le texte de la spirale n'est
 * plus qu'une texture. Ce qui doit rester lisible à cette taille, c'est le nom.
 *
 *   make og      (nécessite google-chrome pour la rastérisation)
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { canvasFor, toPixels, type Format } from '../src/lib/page.ts'
import { compose } from '../src/lib/pipeline.ts'
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings.ts'
import { buildShape } from '../src/lib/shapes.ts'
import { renderSvg } from '../src/lib/svg.ts'

/** Le format imposé par les réseaux sociaux, en pixels. */
const WIDTH = 1200
const HEIGHT = 630

const BACKGROUND = '#0f172a'
const INK = '#5eead4'
const TITLE = '#f8fafc'
const MUTED = '#94a3b8'

const SANS = 'Helvetica, Nimbus Sans, Arial, sans-serif'

/**
 * `canvasFor` raisonne en millimètres, comme tout le moteur. On lui donne donc le
 * format en millimètres qui retombe exactement sur 1200 x 630 pixels de travail,
 * pour que les corps réglés en millimètres gardent leur sens.
 */
const FORMAT: Format = {
  key: 'og',
  label: 'Partage',
  widthMm: WIDTH / 4,
  heightMm: HEIGHT / 4,
}

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  text: 'Un message qui suit le tracé et grandit avec la place libre',
  family: 'serif',
  colour: INK,
  repeat: true,
  maxSizeMm: 6,
  minSizeMm: 2.5,
  turns: 6,
}

const canvas = canvasFor(FORMAT)

/**
 * La spirale occupe un carré à droite ; le titre tient dans la colonne de gauche.
 *
 * Le carré est nettement plus petit que la hauteur disponible, et il le faut : le
 * texte est centré sur le tracé, donc il déborde du carré de la moitié de sa bande
 * d'encre. Serré au bord, le dernier tour se faisait couper.
 */
const SPIRAL_BOX = { x: 600, y: 55, width: 520, height: 520 }

const stroke = buildShape('spirale', SPIRAL_BOX, {
  corner: toPixels(settings.cornerMm),
  turns: settings.turns,
  teeth: settings.teeth,
})

const composition = compose([stroke], canvas, settings)

// Le fond et le titre sont posés autour de la composition, donc celle-ci est rendue
// sans son fond blanc. C'est le même `renderSvg` que l'aperçu et l'export.
const inner = renderSvg(composition, { transparent: true })
  .replace(/^<svg[^>]*>\n?/, '')
  .replace(/<\/svg>\s*$/, '')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
${inner}
  <g font-family="${SANS}">
    <text x="72" y="258" font-size="66" font-weight="700" fill="${TITLE}">Traceur-texteur</text>
    <text x="72" y="316" font-size="27" fill="${INK}">Un texte le long d'un tracé</text>
    <text x="72" y="378" font-size="23" fill="${MUTED}">La taille suit la place disponible,</text>
    <text x="72" y="412" font-size="23" fill="${MUTED}">donc aucune lettre n'en recouvre une autre.</text>
    <text x="72" y="514" font-size="21" fill="${MUTED}">traceur-texteur.vercel.app</text>
  </g>
</svg>
`

mkdirSync('out', { recursive: true })
writeFileSync('out/og.svg', svg)

execFileSync('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${WIDTH},${HEIGHT}`,
  '--screenshot=public/og.png',
  `file://${process.cwd()}/out/og.svg`,
])

const { stats } = composition
console.log(
  `-> public/og.png (${WIDTH}x${HEIGHT}, ${stats.glyphs} lettres, ` +
    `${stats.minSizeMm.toFixed(1)} a ${stats.maxSizeMm.toFixed(1)} mm, ` +
    `${stats.overlaps} chevauchement)`,
)
