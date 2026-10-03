import { inkedIn } from '@/lib/mask'
import type { Mask, Point, Stroke } from '@/lib/types'

/**
 * Suivi du contour extérieur de chaque tache d'encre, par balayage radial
 * (algorithme de Moore).
 *
 * C'est exactement ce que traceur-compteur reprochait aux générateurs de
 * relier-les-points : ne garder que la silhouette et jeter tout l'intérieur.
 * Ici c'est le bon choix par défaut, et l'inversion est instructive. Un
 * relier-les-points veut la totalité du dessin, quitte à le découper en cent
 * soixante-dix traits. Une phrase, elle, a besoin de **longueur continue** : sur
 * un trait de trois millimètres il n'y a pas la place d'une syllabe. Le contour
 * d'une forme est une boucle fermée unique, donc la plus longue courbe continue
 * qu'un dessin puisse offrir.
 *
 * Le squelette reste disponible pour qui veut le nuage de fragments : voir
 * `trace.ts`.
 */

/** Les huit voisins dans l'ordre horaire, indexés pour le balayage. */
const DIRECTIONS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const

/** Index de l'ouest dans `DIRECTIONS`. */
const WEST = 4

/** Index de la direction opposée : quatre crans sur huit. */
const OPPOSITE = 4

export function traceContours(mask: Mask): Stroke[] {
  const { width, height, data } = mask
  const inked = inkedIn(mask)

  const claimed = new Uint8Array(width * height)
  const strokes: Stroke[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!data[start] || claimed[start]) continue

      // Balayé de haut en bas et de gauche à droite, ce pixel est le plus haut
      // à gauche de sa tache : son voisin ouest est donc forcément du fond, ce
      // qui donne un point de départ valide au balayage.
      const contour = walkContour(x, y, inked)
      // Toute la tache est marquée, pas seulement son bord : sans ça, le
      // balayage repartirait sur le premier pixel intérieur rencontré et
      // retracerait le même contour.
      fill(x, y, mask, claimed)

      if (contour.length >= 3) {
        strokes.push({ points: contour, closed: true })
      }
    }
  }

  return strokes
}

/**
 * Depuis un pixel de bord, tourne autour de la tache jusqu'à revenir dans le
 * même état.
 *
 * L'arrêt se fait sur la répétition d'un couple (pixel, direction d'arrivée) et
 * non sur le simple retour au point de départ : un contour en forme de huit
 * repasse par son point de départ au milieu du parcours, et s'y arrêter
 * n'en rendrait que la moitié.
 */
function walkContour(
  startX: number,
  startY: number,
  inked: (x: number, y: number) => boolean,
): Point[] {
  const points: Point[] = []
  const visited = new Set<string>()

  let x = startX
  let y = startY
  // Direction d'où l'on vient : l'ouest, dont on sait qu'il est du fond.
  let from = WEST

  for (;;) {
    const state = `${x},${y},${from}`
    if (visited.has(state)) break
    visited.add(state)
    points.push({ x, y })

    let moved = false
    for (let k = 1; k <= 8; k++) {
      const direction = (from + k) % 8
      const [dx, dy] = DIRECTIONS[direction]!
      if (!inked(x + dx, y + dy)) continue
      x += dx
      y += dy
      from = (direction + OPPOSITE) % 8
      moved = true
      break
    }

    // Pixel isolé : aucun voisin encré, il n'y a pas de contour à suivre.
    if (!moved) break
  }

  return points
}

/** Marque toute la tache connexe, bord et intérieur. */
function fill(startX: number, startY: number, mask: Mask, claimed: Uint8Array): void {
  const { width, height, data } = mask
  const stack = [startY * width + startX]
  claimed[stack[0]!] = 1

  while (stack.length > 0) {
    const p = stack.pop()!
    const x = p % width
    const y = (p - x) / width

    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const q = ny * width + nx
      if (!data[q] || claimed[q]) continue
      claimed[q] = 1
      stack.push(q)
    }
  }
}
