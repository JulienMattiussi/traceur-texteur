import type { FontMetrics } from '@/lib/fonts'
import { buildCellGrid } from '@/lib/grid'
import { advanceOf, bandHeight, baselineOffset } from '@/lib/metrics'
import type { Glyph, Point } from '@/lib/types'

/**
 * Vérification de la promesse du projet : aucune lettre n'en recouvre une autre.
 *
 * Tout le moteur est construit pour que ce compte soit nul. Le mesurer plutôt
 * que le supposer est le seul moyen de savoir si les plafonds de `sizing.ts`
 * suffisent : eux raisonnent sur des échantillons du tracé, pas sur les boîtes
 * réellement posées, et ils bornent une bande alors qu'un caractère occupe un
 * rectangle. Un chiffre non nul veut dire que ces plafonds ont laissé passer un
 * cas qu'ils ne voient pas.
 */

/** Absorbe le contact exact, que le flottant rendrait tantôt disjoint tantôt sécant. */
const SLACK = 0.98

interface OrientedBox {
  centre: Point
  /** Demi-largeur le long de la ligne de base, demi-hauteur en travers. */
  halfWidth: number
  halfHeight: number
  cos: number
  sin: number
}

/**
 * Boîte d'encre d'un caractère, dans le plan.
 *
 * La largeur retenue est l'avance et non l'encre du glyphe seul : c'est la place
 * que le caractère réserve, et deux avances qui se touchent sont le résultat
 * normal d'une composition serrée, pas un défaut.
 */
function boxOf(glyph: Glyph, font: FontMetrics): OrientedBox {
  const advance = advanceOf(font, glyph.char, glyph.size)
  const band = bandHeight(font, glyph.size)
  const cos = Math.cos(glyph.angle)
  const sin = Math.sin(glyph.angle)

  // La bande d'encre est centrée sur le tracé, donc son centre se retrouve en
  // remontant depuis la ligne de base le long de la normale.
  const offset = baselineOffset(font, glyph.size)
  return {
    centre: { x: glyph.x + sin * offset, y: glyph.y - cos * offset },
    halfWidth: advance / 2,
    halfHeight: band / 2,
    cos,
    sin,
  }
}

/** Rayon du cercle circonscrit : sert à écarter d'emblée les paires lointaines. */
function radiusOf(box: OrientedBox): number {
  return Math.hypot(box.halfWidth, box.halfHeight)
}

/**
 * Théorème des axes séparateurs. Deux rectangles orientés sont disjoints s'il
 * existe un axe, parmi les quatre portés par leurs côtés, sur lequel leurs
 * projections ne se recouvrent pas.
 */
function overlaps(a: OrientedBox, b: OrientedBox): boolean {
  const dx = b.centre.x - a.centre.x
  const dy = b.centre.y - a.centre.y

  const axes = [
    { x: a.cos, y: a.sin },
    { x: -a.sin, y: a.cos },
    { x: b.cos, y: b.sin },
    { x: -b.sin, y: b.cos },
  ]

  for (const axis of axes) {
    const gap = Math.abs(dx * axis.x + dy * axis.y)
    const reachA =
      Math.abs(a.halfWidth * (a.cos * axis.x + a.sin * axis.y)) +
      Math.abs(a.halfHeight * (-a.sin * axis.x + a.cos * axis.y))
    const reachB =
      Math.abs(b.halfWidth * (b.cos * axis.x + b.sin * axis.y)) +
      Math.abs(b.halfHeight * (-b.sin * axis.x + b.cos * axis.y))
    if (gap >= (reachA + reachB) * SLACK) return false
  }

  return true
}

/**
 * Compte les paires de caractères qui se recouvrent.
 *
 * Les voisins immédiats dans l'ordre de pose sont exclus : leurs avances se
 * touchent par construction, c'est ce qui fait un mot.
 */
export function countOverlaps(glyphs: Glyph[], font: FontMetrics): number {
  const boxes = glyphs.map((glyph) => boxOf(glyph, font))
  if (boxes.length === 0) return 0

  let reach = 0
  for (const box of boxes) reach = Math.max(reach, radiusOf(box))
  const cell = Math.max(2 * reach, 1e-6)

  const grid = buildCellGrid(
    boxes.length,
    cell,
    (index) => boxes[index]!.centre.x,
    (index) => boxes[index]!.centre.y,
  )

  // Chaque caractère n'appartient qu'à une cellule, donc une paire n'est visitée
  // qu'une fois : pas de dédoublonnage à faire.
  let total = 0

  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!
    const cellX = grid.cellOf(a.centre.x)
    const cellY = grid.cellOf(a.centre.y)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.bucketAt(cellX + dx, cellY + dy)
        if (!bucket) continue

        for (const j of bucket) {
          if (j <= i) continue
          if (j - i <= 1) continue

          const b = boxes[j]!
          const span = Math.hypot(b.centre.x - a.centre.x, b.centre.y - a.centre.y)
          if (span > radiusOf(a) + radiusOf(b)) continue

          if (overlaps(a, b)) total++
        }
      }
    }
  }

  return total
}
