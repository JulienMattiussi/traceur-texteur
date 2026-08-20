import { describe, expect, it } from 'vitest'
import { polylineLength } from '@/lib/geometry'
import { canvasFor, formatByKey } from '@/lib/page'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings'
import { strokesFor } from '@/lib/source'
import type { Point } from '@/lib/types'
import { grayRectangle } from '../fixtures'

const canvas = canvasFor(formatByKey('a4-portrait'))
const settings: Settings = { ...DEFAULT_SETTINGS, threshold: 128 }

/** Un carré d'encre, dont on connaît le contour. */
const image = {
  gray: grayRectangle(200, 200, { x: 50, y: 50, width: 100, height: 100 }),
  width: 200,
  height: 200,
}

/** Un geste à la souris, en coordonnées normalisées comme les renvoie la surface. */
function gesture(count: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({ x: 0.1 + (0.8 * i) / (count - 1), y: 0.5 }))
}

function insideCanvas(points: Point[]): boolean {
  return points.every(
    (point) =>
      point.x >= canvas.inset.x - 1e-6 &&
      point.y >= canvas.inset.y - 1e-6 &&
      point.x <= canvas.inset.x + canvas.inset.width + 1e-6 &&
      point.y <= canvas.inset.y + canvas.inset.height + 1e-6,
  )
}

describe('strokesFor', () => {
  it('rend la forme demandée', () => {
    for (const shape of ['spirale', 'cercle', 'rectangle', 'triangle', 'zigzag'] as const) {
      const strokes = strokesFor('forme', { ...settings, shape }, canvas)
      expect(strokes, shape).toHaveLength(1)
      expect(insideCanvas(strokes[0]!.points), shape).toBe(true)
    }
  })

  it('suit le contour d’un dessin déposé', () => {
    const strokes = strokesFor('dessin', settings, canvas, { image })

    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.closed).toBe(true)
    expect(insideCanvas(strokes[0]!.points)).toBe(true)
  })

  it('ne rend rien sans dessin', () => {
    expect(strokesFor('dessin', settings, canvas)).toEqual([])
    expect(strokesFor('dessin', settings, canvas, { image: null })).toEqual([])
  })

  it('écarte les tracés plus courts que la longueur minimale', () => {
    const long = strokesFor('dessin', { ...settings, minLengthMm: 1 }, canvas, { image })
    const none = strokesFor('dessin', { ...settings, minLengthMm: 10_000 }, canvas, { image })

    expect(long).toHaveLength(1)
    expect(none).toHaveLength(0)
  })

  it('met le geste à la souris à l’échelle de la page', () => {
    // La surface de tracé ne connaît que sa propre taille à l'écran, donc elle
    // renvoie des coordonnées entre 0 et 1 : c'est ici qu'elles deviennent des
    // pixels de page.
    const strokes = strokesFor('souris', settings, canvas, { paths: [gesture(40)] })

    expect(strokes).toHaveLength(1)
    expect(insideCanvas(strokes[0]!.points)).toBe(true)
    // Le geste couvre 80 % de la largeur utile.
    expect(polylineLength(strokes[0]!.points, false)).toBeCloseTo(canvas.inset.width * 0.8, 0)
  })

  it('garde plusieurs gestes séparés', () => {
    const second = gesture(40).map((point) => ({ ...point, y: 0.8 }))
    expect(strokesFor('souris', settings, canvas, { paths: [gesture(40), second] })).toHaveLength(2)
  })

  it('écarte un clic, qui n’est pas un tracé', () => {
    expect(strokesFor('souris', settings, canvas, { paths: [[{ x: 0.5, y: 0.5 }]] })).toEqual([])
    expect(strokesFor('souris', settings, canvas, { paths: [] })).toEqual([])
    expect(strokesFor('souris', settings, canvas)).toEqual([])
  })

  it('referme un geste revenu près de son départ, et pas un autre', () => {
    // La fermeture se juge sur l'écart entre le premier et le dernier point, pas sur
    // la forme : un cercle abandonné avant la fin reste un arc ouvert.
    const arc = (fraction: number): Point[] => {
      const points: Point[] = []
      for (let i = 0; i <= 120; i++) {
        const angle = 2 * Math.PI * fraction * (i / 120)
        points.push({ x: 0.5 + 0.3 * Math.cos(angle), y: 0.5 + 0.3 * Math.sin(angle) })
      }
      return points
    }

    const closed = strokesFor('souris', settings, canvas, { paths: [arc(1)] })
    expect(closed[0]!.closed).toBe(true)

    const open = strokesFor('souris', settings, canvas, { paths: [arc(0.75)] })
    expect(open[0]!.closed).toBe(false)
  })
})
