import type { Mask, Point, Stroke } from '@/lib/types'

/**
 * Tracés et dessins synthétiques.
 *
 * Rien n'est lu depuis un fichier image : les cas sont construits par le calcul,
 * donc déterministes, sans binaire dans git, et surtout on connaît la réponse
 * exacte. Un cercle de rayon connu a une courbure connue et un périmètre connu,
 * ce qui permet de vérifier le moteur contre la géométrie plutôt que contre une
 * capture de son propre résultat.
 */

/** Segment horizontal, la courbure y est nulle partout. */
export function line(length: number, y = 0): Stroke {
  const points: Point[] = []
  for (let x = 0; x <= length; x++) points.push({ x, y })
  return { points, closed: false }
}

/** Cercle de rayon exact : sa courbure vaut 1/rayon en tout point. */
export function circle(radius: number, centre: Point = { x: 0, y: 0 }, steps = 720): Stroke {
  const points: Point[] = []
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    points.push({
      x: centre.x + radius * Math.cos(angle),
      y: centre.y + radius * Math.sin(angle),
    })
  }
  return { points, closed: true }
}

/**
 * Deux segments horizontaux parallèles, séparés d'une distance connue. C'est le
 * cas le plus simple où la place libre a une valeur exacte à vérifier.
 */
export function parallelLines(length: number, gap: number): Stroke[] {
  return [line(length, 0), line(length, gap)]
}

/** Masque binaire vide, à remplir. */
function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) }
}

/** Rectangle plein d'encre dans un masque : une tache dont on connaît le contour. */
export function filledRectangle(
  width: number,
  height: number,
  box: { x: number; y: number; width: number; height: number },
): Mask {
  const mask = emptyMask(width, height)
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      mask.data[y * width + x] = 1
    }
  }
  return mask
}

/** Image en niveaux de gris : encre noire sur papier blanc, aux mêmes coordonnées. */
export function grayRectangle(
  width: number,
  height: number,
  box: { x: number; y: number; width: number; height: number },
): Uint8Array {
  const gray = new Uint8Array(width * height).fill(255)
  const mask = filledRectangle(width, height, box)
  for (let i = 0; i < gray.length; i++) if (mask.data[i]) gray[i] = 0
  return gray
}
