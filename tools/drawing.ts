/**
 * Un dessin au trait synthétique, en niveaux de gris, pour le harnais de mesure.
 *
 * Synthétique plutôt que photographique, pour la même raison que les fixtures de
 * test : c'est déterministe, ça ne met aucun binaire dans git, et on sait ce qu'on
 * attend. Ça permet d'exercer la chaîne complète du mode « dessin »
 * (binarisation, suivi de contour, cadrage) sans dépendre du décodeur d'images du
 * navigateur, qui est la seule pièce que `src/lib` ne contient pas.
 */
import type { Point } from '../src/lib/types.ts'

interface Drawing {
  gray: Uint8Array
  width: number
  height: number
}

/** Distance d'un point au segment [a, b]. */
function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - a.x, py - a.y)

  let t = ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Rasterise des lignes brisées épaisses : encre noire sur papier blanc. */
function drawStrokes(
  width: number,
  height: number,
  paths: Point[][],
  thickness: number,
): Drawing {
  const gray = new Uint8Array(width * height).fill(255)

  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!
      const b = path[i]!

      // Seule la boîte du segment est parcourue : sur un dessin de plusieurs
      // centaines de pixels, balayer toute l'image par segment serait inutilement
      // long.
      const left = Math.max(0, Math.floor(Math.min(a.x, b.x) - thickness))
      const right = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + thickness))
      const top = Math.max(0, Math.floor(Math.min(a.y, b.y) - thickness))
      const bottom = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + thickness))

      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          if (distanceToSegment(x, y, a, b) <= thickness) gray[y * width + x] = 0
        }
      }
    }
  }

  return { gray, width, height }
}

/**
 * Une étoile à cinq branches, tracée d'un trait épais et fermée.
 *
 * Bon cas d'essai du mode contour : une seule tache d'encre, mais dont la
 * silhouette alterne pointes serrées et longues portions droites, donc où les deux
 * plafonds de taille jouent l'un après l'autre.
 */
export function star(size: number, points = 5): Drawing {
  const centre = size / 2
  const outer = size * 0.42
  const inner = outer * 0.42
  const path: Point[] = []

  for (let i = 0; i <= points * 2; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / points
    const radius = i % 2 === 0 ? outer : inner
    path.push({ x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) })
  }

  return drawStrokes(size, size, [path], size * 0.012)
}
