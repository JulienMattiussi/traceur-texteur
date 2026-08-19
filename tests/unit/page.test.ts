import { describe, expect, it } from 'vitest'
import {
  canvasFor,
  fitStrokes,
  formatByKey,
  FORMATS,
  MARGIN_MM,
  PIXELS_PER_MM,
  toMillimetres,
  toPixels,
} from '@/lib/page'
import { circle, line } from '../fixtures'

describe('formatByKey', () => {
  it('retrouve chaque format annoncé', () => {
    for (const format of FORMATS) expect(formatByKey(format.key)).toBe(format)
  })

  it('retombe sur le premier format pour une clé inconnue', () => {
    // Une clé venue d'un état sauvegardé obsolète ne doit pas casser la page.
    expect(formatByKey('inexistant')).toBe(FORMATS[0])
  })
})

describe('canvasFor', () => {
  it('réserve la marge de tous les côtés', () => {
    const canvas = canvasFor(formatByKey('a4-portrait'))
    const margin = MARGIN_MM * PIXELS_PER_MM

    expect(canvas.inset.x).toBe(margin)
    expect(canvas.inset.y).toBe(margin)
    expect(canvas.inset.width).toBe(canvas.width - 2 * margin)
    expect(canvas.inset.height).toBe(canvas.height - 2 * margin)
  })

  it('donne au A4 ses proportions', () => {
    const canvas = canvasFor(formatByKey('a4-portrait'))
    expect(canvas.width / canvas.height).toBeCloseTo(210 / 297, 3)
  })
})

describe('conversion en millimètres', () => {
  it('est réciproque', () => {
    for (const millimetres of [0.5, 7, 190]) {
      expect(toMillimetres(toPixels(millimetres))).toBeCloseTo(millimetres, 9)
    }
  })
})

describe('fitStrokes', () => {
  const canvas = canvasFor(formatByKey('a4-portrait'))

  it('inscrit les tracés dans la zone utile', () => {
    const fitted = fitStrokes([line(1000)], canvas)
    for (const point of fitted[0]!.points) {
      expect(point.x).toBeGreaterThanOrEqual(canvas.inset.x - 1e-6)
      expect(point.x).toBeLessThanOrEqual(canvas.inset.x + canvas.inset.width + 1e-6)
      expect(point.y).toBeGreaterThanOrEqual(canvas.inset.y - 1e-6)
      expect(point.y).toBeLessThanOrEqual(canvas.inset.y + canvas.inset.height + 1e-6)
    }
  })

  it('préserve les proportions : un cercle dessiné reste un cercle', () => {
    const fitted = fitStrokes([circle(100)], canvas)
    const xs = fitted[0]!.points.map((point) => point.x)
    const ys = fitted[0]!.points.map((point) => point.y)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)
    expect(width).toBeCloseTo(height, 1)
  })

  it('centre le résultat', () => {
    // Un carré dans une page portrait doit être à égale distance du haut et du bas.
    const square = { points: circle(100).points, closed: true }
    const fitted = fitStrokes([square], canvas)
    const ys = fitted[0]!.points.map((point) => point.y)
    const above = Math.min(...ys) - canvas.inset.y
    const below = canvas.inset.y + canvas.inset.height - Math.max(...ys)
    expect(above).toBeCloseTo(below, 1)
  })

  it('met tous les tracés à la même échelle, dans un seul repère', () => {
    // Deux tracés cadrés séparément se retrouveraient tous les deux à remplir la
    // page, donc superposés.
    const small = { points: circle(10, { x: 0, y: 0 }).points, closed: true }
    const big = { points: circle(100, { x: 500, y: 0 }).points, closed: true }
    const fitted = fitStrokes([small, big], canvas)

    const spread = (index: number): number => {
      const xs = fitted[index]!.points.map((point) => point.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(spread(1) / spread(0)).toBeCloseTo(10, 0)
  })

  it('laisse un tracé vide tel quel', () => {
    expect(fitStrokes([{ points: [], closed: false }], canvas)).toEqual([
      { points: [], closed: false },
    ])
  })

  it('conserve l’état ouvert ou fermé', () => {
    const fitted = fitStrokes([line(100), circle(50)], canvas)
    expect(fitted.map((stroke) => stroke.closed)).toEqual([false, true])
  })
})
