/**
 * Géométrie de la page.
 *
 * Comme dans traceur-compteur, le moteur raisonne en millimètres de papier et
 * non en pixels : la même spirale rendue en 800 ou en 2000 px doit donner la
 * même feuille, donc seule la taille imprimée est une unité de lisibilité qui
 * ait un sens. Les pixels ne servent qu'au calcul.
 */
import type { Rect, Stroke } from '@/lib/types'

export interface Format {
  key: string
  label: string
  widthMm: number
  heightMm: number
}

/** Marge blanche tout autour, en millimètres. */
export const MARGIN_MM = 10

export const FORMATS: Format[] = [
  { key: 'a4-portrait', label: 'A4 portrait', widthMm: 210, heightMm: 297 },
  { key: 'a4-paysage', label: 'A4 paysage', widthMm: 297, heightMm: 210 },
  { key: 'carre', label: 'Carré', widthMm: 210, heightMm: 210 },
]

export function formatByKey(key: string): Format {
  return FORMATS.find((format) => format.key === key) ?? FORMATS[0]!
}

/**
 * Résolution de travail. Elle ne change rien au rendu, qui est vectoriel, mais
 * elle fixe le pas d'échantillonnage : plus elle est haute, plus la courbure et
 * la place libre sont mesurées finement, et plus le calcul coûte.
 */
export const PIXELS_PER_MM = 4

export interface Canvas {
  width: number
  height: number
  /** Zone utile, marges déduites, en pixels. */
  inset: Rect
}

export function canvasFor(format: Format): Canvas {
  const width = Math.round(format.widthMm * PIXELS_PER_MM)
  const height = Math.round(format.heightMm * PIXELS_PER_MM)
  const margin = MARGIN_MM * PIXELS_PER_MM
  return {
    width,
    height,
    inset: { x: margin, y: margin, width: width - 2 * margin, height: height - 2 * margin },
  }
}

export function toPixels(millimetres: number): number {
  return millimetres * PIXELS_PER_MM
}

export function toMillimetres(pixels: number): number {
  return pixels / PIXELS_PER_MM
}

/**
 * Met des tracés à l'échelle de la zone utile en préservant leurs proportions,
 * puis les centre.
 *
 * C'est le seul endroit qui décide du cadrage, et c'est ce qui rend le moteur
 * indifférent à la provenance des tracés : une forme, un dessin décodé ou un
 * geste à la souris arrivent tous dans le même repère, à la même échelle. Le
 * rapport de forme est préservé pour la même raison qu'on ne déforme pas une
 * photo : un cercle dessiné doit rester un cercle.
 */
export function fitStrokes(strokes: Stroke[], canvas: Canvas): Stroke[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
  }

  if (!Number.isFinite(minX)) return strokes

  const sourceWidth = Math.max(maxX - minX, 1e-6)
  const sourceHeight = Math.max(maxY - minY, 1e-6)
  const scale = Math.min(canvas.inset.width / sourceWidth, canvas.inset.height / sourceHeight)

  const offsetX = canvas.inset.x + (canvas.inset.width - sourceWidth * scale) / 2
  const offsetY = canvas.inset.y + (canvas.inset.height - sourceHeight * scale) / 2

  return strokes.map((stroke) => ({
    closed: stroke.closed,
    points: stroke.points.map((point) => ({
      x: offsetX + (point.x - minX) * scale,
      y: offsetY + (point.y - minY) * scale,
    })),
  }))
}
