import { dedupe, distance } from '@/lib/geometry'
import type { Point, Stroke } from '@/lib/types'

/**
 * Lissage d'un tracé fait à la main.
 *
 * Un tracé à la souris arrive en dents de scie : les événements de pointeur sont
 * irréguliers, et un mouvement rapide saute plusieurs pixels quand un mouvement
 * lent en renvoie dix au même endroit. Rien de tout cela ne se voit sur un trait
 * fin, mais la courbure, elle, est une dérivée seconde : le moindre tremblement
 * y devient un virage serré, et le plafond de courbure écraserait le texte sur
 * toute la longueur du tracé.
 *
 * Lisser n'est donc pas une politesse esthétique, c'est ce qui rend la courbure
 * mesurable.
 */

/**
 * Moyenne glissante appliquée plusieurs fois, ce qui approche un lissage
 * gaussien pour bien moins de calcul. Les extrémités d'un tracé ouvert sont
 * laissées en place : les déplacer raccourcirait le trait à chaque passe.
 */
export function smoothPoints(points: Point[], closed: boolean, passes: number): Point[] {
  let current = points

  for (let pass = 0; pass < passes; pass++) {
    const count = current.length
    if (count < 3) return current
    const next: Point[] = new Array(count)

    for (let i = 0; i < count; i++) {
      if (!closed && (i === 0 || i === count - 1)) {
        next[i] = current[i]!
        continue
      }
      const previous = current[(i - 1 + count) % count]!
      const point = current[i]!
      const following = current[(i + 1) % count]!
      next[i] = {
        x: (previous.x + 2 * point.x + following.x) / 4,
        y: (previous.y + 2 * point.y + following.y) / 4,
      }
    }

    current = next
  }

  return current
}

export interface FreehandOptions {
  /** Nombre de passes de lissage. */
  passes: number
  /**
   * Distance sous laquelle un tracé revenu près de son départ est refermé.
   * Refermer change tout : le texte peut alors tourner sans fin plutôt que de
   * s'arrêter net à deux millimètres de son début.
   */
  closeWithin: number
}

/** Transforme une suite de positions de pointeur en tracé exploitable. */
export function freehandStroke(points: Point[], options: FreehandOptions): Stroke | null {
  const cleaned = dedupe(points, 0.5)
  if (cleaned.length < 3) return null

  const first = cleaned[0]!
  const last = cleaned[cleaned.length - 1]!
  const closed = distance(first, last) <= options.closeWithin

  // Le point de recollement est retiré : sur un tracé fermé, le dernier point
  // est à un pas du premier, il ne doit pas être le premier.
  const body = closed ? cleaned.slice(0, -1) : cleaned

  return { points: smoothPoints(body, closed, options.passes), closed }
}
