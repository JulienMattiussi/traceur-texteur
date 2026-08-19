import { describe, expect, it } from 'vitest'
import { HELVETICA } from '@/lib/fonts'
import { advanceOf, bandHeight } from '@/lib/metrics'
import { countOverlaps } from '@/lib/quality'
import type { Glyph } from '@/lib/types'

const SIZE = 20
const ADVANCE = advanceOf(HELVETICA, 'n', SIZE)
const BAND = bandHeight(HELVETICA, SIZE)

function glyph(x: number, y: number, angle = 0): Glyph {
  return { char: 'n', x, y, angle, size: SIZE }
}

describe('countOverlaps', () => {
  it('ne compte rien sur un texte vide', () => {
    expect(countOverlaps([], HELVETICA)).toBe(0)
  })

  it('ne reproche pas aux lettres voisines de se toucher', () => {
    // Deux avances qui s'abutent sont le résultat normal d'une composition
    // serrée, pas un défaut : c'est ce qui fait un mot.
    const glyphs = [glyph(0, 0), glyph(ADVANCE, 0), glyph(2 * ADVANCE, 0)]
    expect(countOverlaps(glyphs, HELVETICA)).toBe(0)
  })

  it('voit deux lettres superposées', () => {
    // Non voisines dans l'ordre de pose, et au même endroit : c'est exactement le
    // défaut que tout le moteur existe pour éviter.
    const glyphs = [glyph(0, 0), glyph(500, 0), glyph(0.5, 0)]
    expect(countOverlaps(glyphs, HELVETICA)).toBe(1)
  })

  it('voit deux lignes de texte trop rapprochées', () => {
    const above: Glyph[] = []
    const below: Glyph[] = []
    for (let i = 0; i < 6; i++) {
      above.push(glyph(i * ADVANCE, 0))
      // Un quart de bande d'écart : les deux lignes se chevauchent largement.
      below.push(glyph(i * ADVANCE, BAND / 4))
    }
    expect(countOverlaps([...above, ...below], HELVETICA)).toBeGreaterThan(0)
  })

  it('laisse passer deux lignes séparées d’une bande entière', () => {
    const glyphs: Glyph[] = []
    for (let i = 0; i < 6; i++) glyphs.push(glyph(i * ADVANCE, 0))
    for (let i = 0; i < 6; i++) glyphs.push(glyph(i * ADVANCE, BAND * 1.01))
    expect(countOverlaps(glyphs, HELVETICA)).toBe(0)
  })

  it('mesure une boîte orientée, et non un cercle', () => {
    // Une lettre est bien plus haute que large : ici 23,5 contre 11,1. Au même
    // écart, deux lettres côte à côte se dégagent alors que deux lettres l'une
    // au-dessus de l'autre se recouvrent. Une distance entre centres ne saurait pas
    // les distinguer, et laisserait passer des lignes de texte superposées.
    const gap = (ADVANCE + BAND) / 2
    expect(gap).toBeGreaterThan(ADVANCE)
    expect(gap).toBeLessThan(BAND)

    const far = glyph(5000, 5000)
    expect(countOverlaps([glyph(0, 0), far, glyph(gap, 0)], HELVETICA)).toBe(0)
    expect(countOverlaps([glyph(0, 0), far, glyph(0, gap)], HELVETICA)).toBe(1)
  })

  it('compte chaque paire une seule fois', () => {
    // Les paires (0,2) et (0,3) comptent ; (2,3) est exclue comme voisine
    // immédiate dans l'ordre de pose.
    const glyphs = [glyph(0, 0), glyph(5000, 5000), glyph(0.2, 0), glyph(0.4, 0)]
    expect(countOverlaps(glyphs, HELVETICA)).toBe(2)
  })
})
