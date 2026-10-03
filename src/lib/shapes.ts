import { distance } from '@/lib/geometry'
import type { Point, Rect, Stroke } from '@/lib/types'

/**
 * Les tracés de base, engendrés directement dans le repère de la page.
 *
 * Tous les angles vifs sont arrondis. Ce n'est pas une coquetterie : un angle
 * droit a une courbure infinie, et le plafond de courbure y écraserait le texte
 * jusqu'au plancher de lisibilité. Un coin arrondi de quelques millimètres suffit
 * à ce que le texte tourne sans rétrécir.
 */

export type ShapeKind = 'cercle' | 'rectangle' | 'triangle' | 'spirale' | 'zigzag'

/**
 * Les formes proposées, et les réglages que chacune lit. L'interface s'en sert pour
 * n'afficher que les curseurs utiles : c'est ici qu'on sait qu'un cercle n'a pas
 * d'angles, pas dans le composant.
 */
export const SHAPES: { kind: ShapeKind; label: string; options: (keyof ShapeOptions)[] }[] = [
  { kind: 'spirale', label: 'Spirale', options: ['turns'] },
  { kind: 'cercle', label: 'Cercle', options: [] },
  { kind: 'rectangle', label: 'Rectangle', options: ['corner'] },
  { kind: 'triangle', label: 'Triangle', options: ['corner'] },
  { kind: 'zigzag', label: 'Zigzag', options: ['teeth', 'corner'] },
]

export interface ShapeOptions {
  /** Rayon des coins arrondis, en pixels. */
  corner: number
  /** Nombre de tours de la spirale. */
  turns: number
  /** Nombre de dents du zigzag. */
  teeth: number
}

/**
 * Adoucit chaque sommet par une courbe de Bézier quadratique dont le point de
 * contrôle est le sommet lui-même : la courbe part et arrive tangente aux deux
 * côtés, donc le raccord est lisse sans avoir à calculer d'arc de cercle.
 */
export function roundCorners(points: Point[], closed: boolean, radius: number): Point[] {
  const count = points.length
  if (radius <= 0 || count < 3) return points

  const out: Point[] = []

  /**
   * Deux points confondus rendraient la tangente indéfinie à cet endroit. Ils
   * arrivent dès que l'arrondi atteint la moitié d'un côté : la fin d'un coin et
   * le début du suivant tombent alors tous deux sur le milieu du côté.
   */
  const push = (point: Point): void => {
    const last = out[out.length - 1]
    if (last && distance(last, point) < 1e-9) return
    out.push(point)
  }

  const first = closed ? 0 : 1
  const last = closed ? count - 1 : count - 2

  if (!closed) push(points[0]!)

  for (let i = first; i <= last; i++) {
    const vertex = points[i]!
    const previous = points[(i - 1 + count) % count]!
    const next = points[(i + 1) % count]!

    // Jamais plus de la moitié d'un côté, sinon deux coins voisins se
    // mordraient et la forme se replierait sur elle-même.
    const cut = Math.min(radius, distance(vertex, previous) / 2, distance(vertex, next) / 2)
    if (cut <= 0) {
      push(vertex)
      continue
    }

    const start = towards(vertex, previous, cut)
    const end = towards(vertex, next, cut)

    const steps = Math.max(2, Math.ceil(cut))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const u = 1 - t
      push({
        x: u * u * start.x + 2 * u * t * vertex.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * vertex.y + t * t * end.y,
      })
    }
  }

  if (!closed) push(points[count - 1]!)

  // Sur un tracé fermé, le dernier point peut aussi rejoindre le premier.
  if (closed && out.length > 2 && distance(out[out.length - 1]!, out[0]!) < 1e-9) out.pop()

  return out
}

function towards(from: Point, to: Point, length: number): Point {
  const span = distance(from, to)
  if (span === 0) return from
  return {
    x: from.x + ((to.x - from.x) * length) / span,
    y: from.y + ((to.y - from.y) * length) / span,
  }
}

/** Pas angulaire donnant des segments d'environ un pixel au rayon indiqué. */
function angularStep(radius: number): number {
  return Math.min(Math.PI / 8, 1 / Math.max(radius, 1))
}

/**
 * Cercle et spirale remplissent leur cadre, donc s'ovalisent sur une page qui
 * n'est pas carrée. Un cercle inscrit dans un A4 portrait laisse un tiers de la
 * feuille vide ; l'ovale est ce qu'on veut presque toujours, et le format carré
 * reste là pour qui veut un cercle exact.
 */
function circle(box: Rect): Stroke {
  const radiusX = box.width / 2
  const radiusY = box.height / 2
  const centreX = box.x + radiusX
  const centreY = box.y + radiusY
  const step = angularStep(Math.max(radiusX, radiusY))

  const points: Point[] = []
  for (let angle = 0; angle < 2 * Math.PI; angle += step) {
    points.push({ x: centreX + radiusX * Math.cos(angle), y: centreY + radiusY * Math.sin(angle) })
  }
  return { points, closed: true }
}

function rectangle(box: Rect, options: ShapeOptions): Stroke {
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
  return { points: roundCorners(corners, true, options.corner), closed: true }
}

function triangle(box: Rect, options: ShapeOptions): Stroke {
  const corners: Point[] = [
    { x: box.x + box.width / 2, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
  return { points: roundCorners(corners, true, options.corner), closed: true }
}

/**
 * Spirale d'Archimède, dont le pas est constant : c'est ce qui en fait le bon
 * banc d'essai du projet, puisque le rayon, donc la courbure, y change du tout au
 * tout d'un bout à l'autre.
 *
 * Ovalisée pour remplir son cadre, comme le cercle. L'écart entre deux tours
 * n'est alors plus le même dans la largeur et dans la hauteur, et le texte grossit
 * et rétrécit une fois par tour : c'est précisément ce que le champ de tailles
 * sait faire, et ça se voit à l'oeil.
 *
 * Elle démarre à un pas du centre plutôt qu'au centre même : au centre exact, le
 * rayon tend vers zéro et le texte avec lui.
 */
function spiral(box: Rect, options: ShapeOptions): Stroke {
  const outerX = box.width / 2
  const outerY = box.height / 2
  const centreX = box.x + outerX
  const centreY = box.y + outerY

  const turns = Math.max(1, options.turns)
  const start = 1 / (turns + 1)
  const sweep = 2 * Math.PI * turns

  const points: Point[] = []
  for (let angle = 0; angle <= sweep;) {
    const growth = start + (1 - start) * (angle / sweep)
    points.push({
      x: centreX + outerX * growth * Math.cos(angle),
      y: centreY + outerY * growth * Math.sin(angle),
    })
    angle += angularStep(Math.max(outerX, outerY) * growth)
  }
  return { points, closed: false }
}

function zigzag(box: Rect, options: ShapeOptions): Stroke {
  const teeth = Math.max(1, options.teeth)
  const corners: Point[] = []
  const steps = teeth * 2

  for (let i = 0; i <= steps; i++) {
    corners.push({
      x: box.x + (box.width * i) / steps,
      y: i % 2 === 0 ? box.y + box.height : box.y,
    })
  }

  return { points: roundCorners(corners, false, options.corner), closed: false }
}

export function buildShape(kind: ShapeKind, box: Rect, options: ShapeOptions): Stroke {
  switch (kind) {
    case 'cercle':
      return circle(box)
    case 'rectangle':
      return rectangle(box, options)
    case 'triangle':
      return triangle(box, options)
    case 'spirale':
      return spiral(box, options)
    case 'zigzag':
      return zigzag(box, options)
  }
}
