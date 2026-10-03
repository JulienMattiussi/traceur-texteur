import type { Mask } from '@/lib/types'

/**
 * Outils communs aux modules qui parcourent une image binaire pixel par pixel
 * (`binarize`, `contour`, `graph`). Écrits une fois : chacun en tenait sa copie.
 */

/** Les huit voisins d'un pixel, sans ordre particulier. */
export const NEIGHBOURS_8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

/** Vrai si le pixel est dans l'image et encré : le hors-champ compte comme du fond. */
export function inkedIn(mask: Mask): (x: number, y: number) => boolean {
  const { width, height, data } = mask
  return (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1
}
