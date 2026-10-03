import { describe, expect, it } from 'vitest'
import { LOGO_GLYPHS, LOGO_SPIRAL } from '@/lib/logo'
import { baselineOffset, metricsFor } from '@/lib/metrics'

const spiral = LOGO_SPIRAL.split(' ').map((pair) => {
  const [x, y] = pair.split(',').map(Number)
  return { x: x!, y: y! }
})

/** Distance au polyline, segment par segment : ses points sont espacés de deux unités. */
function distanceToSpiral(x: number, y: number): number {
  let best = Infinity
  for (let i = 1; i < spiral.length; i++) {
    const a = spiral[i - 1]!
    const b = spiral[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(a.x + t * dx - x, a.y + t * dy - y))
  }
  return best
}

describe('LOGO_GLYPHS', () => {
  it('écrit le mot de la marque', () => {
    expect(LOGO_GLYPHS.map((glyph) => glyph.char).join('')).toBe('Texte')
  })

  it('centre la bande d’encre sur la spirale, comme le moteur', () => {
    // La ligne de base s'écarte du tracé le long de la normale ; en remontant du
    // même décalage, on doit retomber sur la spirale, quelle que soit la rotation.
    const font = metricsFor('serif')
    for (const glyph of LOGO_GLYPHS) {
      const offset = baselineOffset(font, glyph.size)
      const x = glyph.x + Math.sin(glyph.angle) * offset
      const y = glyph.y - Math.cos(glyph.angle) * offset
      expect(distanceToSpiral(x, y), glyph.char).toBeLessThan(0.1)
    }
  })

  it('rétrécit les lettres vers le centre, comme le texte sur une spirale', () => {
    const sizes = LOGO_GLYPHS.map((glyph) => glyph.size)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1]!)
  })
})
