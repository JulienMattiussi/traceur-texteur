import { describe, expect, it } from 'vitest'
import { canvasFor, formatByKey, toPixels } from '@/lib/page'
import { compose } from '@/lib/pipeline'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings'
import { buildShape, SHAPES, type ShapeKind } from '@/lib/shapes'
import type { Composition } from '@/lib/types'

function run(overrides: Partial<Settings> = {}): Composition {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...overrides }
  const canvas = canvasFor(formatByKey(settings.formatKey))
  const stroke = buildShape(settings.shape, canvas.inset, {
    corner: toPixels(settings.cornerMm),
    turns: settings.turns,
    teeth: settings.teeth,
  })
  return compose([stroke], canvas, settings)
}

describe('compose', () => {
  it('ne laisse aucune lettre en recouvrir une autre, sur toutes les formes', () => {
    // La promesse du projet, vérifiée de bout en bout plutôt que module par module.
    for (const { kind } of SHAPES) {
      const composition = run({ shape: kind })
      expect(composition.stats.glyphs, kind).toBeGreaterThan(50)
      expect(composition.stats.overlaps, kind).toBe(0)
    }
  })

  it('la tient aussi sur une spirale très serrée', () => {
    // Le cas qui a motivé le projet : vingt tours, donc un écart entre tours trois
    // fois plus petit qu'à sept tours.
    const composition = run({ shape: 'spirale', turns: 20 })
    expect(composition.stats.overlaps).toBe(0)
    expect(composition.stats.glyphs).toBeGreaterThan(1000)
  })

  it('fait varier le corps avec la place disponible', () => {
    // Sur une spirale ovale, l'écart entre tours n'est pas le même dans la largeur
    // et dans la hauteur : le texte doit suivre.
    const { stats } = run({ shape: 'spirale', turns: 12 })
    expect(stats.maxSizeMm).toBeGreaterThan(stats.minSizeMm * 1.5)
    expect(stats.maxSizeMm).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxSizeMm + 1e-9)
  })

  it('respecte la borne haute là où la place ne manque pas', () => {
    for (const maxSizeMm of [3, 5, 9]) {
      const { stats } = run({ shape: 'cercle', maxSizeMm })
      expect(stats.maxSizeMm).toBeCloseTo(maxSizeMm, 6)
    }
  })

  it('écrit plus gros quand on laisse moins d’air', () => {
    const airy = run({ shape: 'spirale', turns: 14, fillRatio: 0.5 })
    const tight = run({ shape: 'spirale', turns: 14, fillRatio: 1 })
    expect(tight.stats.maxSizeMm).toBeGreaterThan(airy.stats.maxSizeMm)
    expect(tight.stats.overlaps).toBe(0)
  })

  it('pose moins de lettres avec de l’interlettrage, sans en faire chevaucher', () => {
    const normal = run({ shape: 'cercle' })
    const spaced = run({ shape: 'cercle', tracking: 0.5 })
    expect(spaced.stats.glyphs).toBeLessThan(normal.stats.glyphs)
    expect(spaced.stats.overlaps).toBe(0)
  })

  it('remplit tout le tracé en mode répétition', () => {
    const { stats } = run({ shape: 'cercle', repeat: true })
    expect(stats.repetitions).toBeGreaterThan(1)
    expect(stats.coverage).toBeGreaterThan(0.95)
  })

  it('n’écrit le message qu’une fois en mode « une seule fois »', () => {
    const { stats } = run({ shape: 'cercle', repeat: false })
    expect(stats.repetitions).toBe(1)
    expect(stats.coverage).toBeLessThan(1)
  })

  it('rend la même feuille quel que soit le format, aux proportions près', () => {
    for (const formatKey of ['a4-portrait', 'a4-paysage', 'carre']) {
      const composition = run({ formatKey, shape: 'cercle' })
      const format = formatByKey(formatKey)
      expect(composition.width / composition.height, formatKey).toBeCloseTo(
        format.widthMm / format.heightMm,
        3,
      )
      expect(composition.stats.overlaps, formatKey).toBe(0)
    }
  })

  it('garde le texte dans la feuille', () => {
    // La marge existe pour que la bande d'encre puisse déborder du cadrage sans
    // sortir du papier : c'est le bord de la page, et non la zone utile, qui est
    // l'obstacle.
    const composition = run({ shape: 'cercle', maxSizeMm: 12 })
    for (const glyph of composition.glyphs) {
      expect(glyph.x).toBeGreaterThan(0)
      expect(glyph.y).toBeGreaterThan(0)
      expect(glyph.x).toBeLessThan(composition.width)
      expect(glyph.y).toBeLessThan(composition.height)
    }
  })

  it('ne rend rien sans tracé, sans lever d’erreur', () => {
    const canvas = canvasFor(formatByKey('a4-portrait'))
    const composition = compose([], canvas, DEFAULT_SETTINGS)
    expect(composition.glyphs).toHaveLength(0)
    expect(composition.stats.strokes).toBe(0)
    expect(composition.stats.coverage).toBe(0)
  })

  it('compte ce qu’il a enjambé plutôt que de l’écrire illisible', () => {
    // Un zigzag à vingt dents a des pointes plus étroites que le corps minimal : le
    // moteur doit les laisser nues et le dire.
    const { stats } = run({ shape: 'zigzag', teeth: 20, cornerMm: 2 })
    expect(stats.skippedMm).toBeGreaterThan(0)
    expect(stats.coverage).toBeLessThan(1)
    expect(stats.overlaps).toBe(0)
  })

  it('reste sous la demi-seconde sur le cas le plus lourd', () => {
    // Bouger un curseur doit rester interactif : la spirale de vingt tours est le
    // pire cas atteignable depuis l'interface.
    const started = performance.now()
    run({ shape: 'spirale', turns: 25 })
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('mémorise les mesures utiles au diagnostic', () => {
    const { stats } = run({ shape: 'spirale' as ShapeKind })
    expect(stats.strokes).toBe(1)
    expect(stats.strokeLength).toBeGreaterThan(0)
    expect(Object.keys(stats.timings)).toEqual(
      expect.arrayContaining(['echantillonnage', 'placeLibre', 'tailles', 'pose', 'controle']),
    )
  })
})
