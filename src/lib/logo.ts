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

export interface SpiralShape {
  /** Nombre de tours, du bord vers le centre. */
  turns: number
  /** Rayon de départ et rayon d'arrivée. */
  outer: number
  inner: number
  /** Angle du premier point. */
  start: number
}

const SHAPE: SpiralShape = { turns: 1.9, outer: OUTER, inner: INNER, start: START }

const radiusAt = (turned: number): number => OUTER - (OUTER - INNER) * (turned / SWEEP)

function pointAt(turned: number): { x: number; y: number } {
  const radius = radiusAt(turned)
  return {
    x: CENTRE + radius * Math.cos(START + turned),
    y: CENTRE + radius * Math.sin(START + turned),
  }
}

/**
 * Une spirale en points prêts pour un `polyline`.
 *
 * Paramétrée parce que la marque et l'icône n'ont pas les mêmes contraintes : à
 * seize pixels de côté, une spirale de deux tours laisse moins de trois pixels
 * entre ses tours, et un tour de plus la referme en tache. L'icône en prend donc
 * moins que la marque, tout en restant la même figure.
 */
export function spiralPoints(shape: SpiralShape, step = 0.12): string {
  const sweep = shape.turns * 2 * Math.PI
  const points: string[] = []

  for (let turned = 0; turned <= sweep; turned += step) {
    const radius = shape.outer - (shape.outer - shape.inner) * (turned / sweep)
    const angle = shape.start + turned
    points.push(
      `${(CENTRE + radius * Math.cos(angle)).toFixed(2)},${(CENTRE + radius * Math.sin(angle)).toFixed(2)}`,
    )
  }

  return points.join(' ')
}

/** Le tracé de la marque, du bord jusqu'au centre. */
export const LOGO_SPIRAL: string = spiralPoints(SHAPE)

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

/**
 * La spirale de l'icône : moins de tours et plus d'air que la marque, et sans les
 * lettres. À seize pixels de côté, cinq lettres de neuf unités deviennent quatre
 * taches grises ; ce qui survit à cette taille, c'est la figure.
 */
export const ICON_SPIRAL: SpiralShape = {
  turns: 1.75,
  outer: 18.5,
  inner: 3,
  start: -Math.PI / 2,
}

/** Épaisseur du trait de l'icône, dans le repère de `LOGO_BOX`. */
export const ICON_STROKE = 3.6

/** Un glyphe de la marque en attributs SVG. Partagé par le composant et le favicon. */
export function logoGlyphTransform(glyph: Glyph): string {
  const degrees = ((glyph.angle * 180) / Math.PI).toFixed(1)
  return `translate(${glyph.x.toFixed(2)} ${glyph.y.toFixed(2)}) rotate(${degrees})`
}
