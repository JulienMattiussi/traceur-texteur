import { advanceOf, metricsFor } from '@/lib/metrics'
import type { Glyph } from '@/lib/types'

/**
 * Géométrie de la marque.
 *
 * Elle montre exactement ce que fait le moteur : le texte occupe le tracé là où il
 * y a de la place, et le tracé continue nu là où il n'y en a plus. La spirale se
 * resserre vers son centre, le mot s'arrête avant.
 *
 * Les lettres sont espacées de leur **avance réelle**, lue dans la même table que
 * tout le reste du projet, et non d'un angle constant. Réparties à angle égal,
 * sept lettres sur un tour laissent cinquante degrés entre chacune et ne se lisent
 * plus comme un mot mais comme des lettres éparpillées : c'est le premier essai qui
 * a été fait, et il ne ressemblait à rien.
 *
 * Ici plutôt que dans le composant parce que le favicon en a besoin aussi, et
 * qu'un fichier statique ne peut pas importer du JSX : les deux dérivent donc de
 * la même source, et la marque ne peut pas diverger d'elle-même.
 */

const WORD = 'Texte'
const CENTRE = 24
const SWEEP = 1.9 * 2 * Math.PI
const OUTER = 20
const INNER = 3.5
/** Le mot démarre en bas à gauche et passe par le haut. */
const START = -Math.PI * 0.92
const BIGGEST = 12
const SMALLEST = 9

/** Côté du carré dans lequel la marque est dessinée. */
export const LOGO_BOX = 48

const radiusAt = (turned: number): number => OUTER - (OUTER - INNER) * (turned / SWEEP)

function pointAt(turned: number): { x: number; y: number } {
  const radius = radiusAt(turned)
  return {
    x: CENTRE + radius * Math.cos(START + turned),
    y: CENTRE + radius * Math.sin(START + turned),
  }
}

/** Le tracé complet, du bord jusqu'au centre, prêt pour un `polyline`. */
export const LOGO_SPIRAL: string = (() => {
  const points: string[] = []
  for (let turned = 0; turned <= SWEEP; turned += 0.12) {
    const point = pointAt(turned)
    points.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`)
  }
  return points.join(' ')
})()

export const LOGO_GLYPHS: Glyph[] = (() => {
  const font = metricsFor('serif')
  const glyphs: Glyph[] = []

  let turned = 0
  for (let index = 0; index < WORD.length; index++) {
    const char = WORD[index]!
    const size = BIGGEST - ((BIGGEST - SMALLEST) * index) / (WORD.length - 1)
    const advance = advanceOf(font, char, size)
    // Un angle d'avance, pas un angle fixe : la lettre suivante commence là où la
    // précédente finit.
    const step = advance / radiusAt(turned)
    const centre = turned + step / 2
    const point = pointAt(centre)

    glyphs.push({
      char,
      x: point.x,
      // La bande d'encre est centrée sur le tracé, comme dans le moteur.
      y: point.y + size * 0.33,
      angle: START + centre + Math.PI / 2,
      size,
    })

    turned += step
  }

  return glyphs
})()

/** Un glyphe de la marque en attributs SVG. Partagé par le composant et le favicon. */
export function logoGlyphTransform(glyph: Glyph): string {
  const degrees = ((glyph.angle * 180) / Math.PI).toFixed(1)
  return `translate(${glyph.x.toFixed(2)} ${glyph.y.toFixed(2)}) rotate(${degrees})`
}
