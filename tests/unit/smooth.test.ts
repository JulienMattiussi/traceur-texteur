import { describe, expect, it } from 'vitest'
import { curvatures, resample, tangentAngles } from '@/lib/geometry'
import { freehandStroke, smoothPoints } from '@/lib/smooth'
import type { Point } from '@/lib/types'

/** Trait tremblé, comme en produit une souris. */
function shaky(length: number, wobble: number): Point[] {
  const points: Point[] = []
  for (let x = 0; x <= length; x++) points.push({ x, y: x % 2 === 0 ? 0 : wobble })
  return points
}

/**
 * Courbure maximale, hors extrémités. Celles-ci sont volontairement laissées en
 * place par le lissage, donc elles gardent un coude résiduel : le mesurer
 * reviendrait à juger le lissage sur les deux seuls points qu'il ne touche pas.
 */
function peakCurvature(points: Point[], closed: boolean): number {
  const { points: sampled, step } = resample(points, closed, 1)
  const angles = tangentAngles(sampled, 4, closed)
  const measured = curvatures(angles, step, 6, closed).map(Math.abs)
  return Math.max(...(closed ? measured : measured.slice(10, -10)))
}

describe('smoothPoints', () => {
  it('abaisse fortement la courbure d’un trait tremblé', () => {
    // La courbure est une dérivée seconde : le moindre tremblement y devient un
    // virage serré, et le plafond de courbure écraserait le texte sur toute la
    // longueur du tracé. Lisser n'est donc pas une politesse esthétique.
    //
    // Le gain mesuré est d'un facteur 3,6. Il n'est pas plus élevé parce que la
    // mesure de courbure du pipeline lisse déjà sur plusieurs millimètres, donc
    // absorbe une bonne part du tremblement à elle seule : ce facteur est ce que le
    // lissage ajoute par-dessus.
    const raw = shaky(200, 2)
    const smoothed = smoothPoints(raw, false, 6)
    expect(peakCurvature(smoothed, false)).toBeLessThan(peakCurvature(raw, false) / 3)
  })

  it('laisse les extrémités d’un tracé ouvert en place', () => {
    // Les déplacer raccourcirait le trait à chaque passe.
    const raw = shaky(50, 3)
    const smoothed = smoothPoints(raw, false, 10)
    expect(smoothed[0]).toEqual(raw[0])
    expect(smoothed[smoothed.length - 1]).toEqual(raw[raw.length - 1])
  })

  it('lisse aussi le recollement d’un tracé fermé', () => {
    const raw = shaky(40, 3)
    const smoothed = smoothPoints(raw, true, 4)
    expect(smoothed[0]).not.toEqual(raw[0])
  })

  it('ne change pas le nombre de points', () => {
    const raw = shaky(30, 2)
    expect(smoothPoints(raw, false, 5)).toHaveLength(raw.length)
  })

  it('ne touche à rien sous trois points', () => {
    const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(smoothPoints(two, false, 5)).toEqual(two)
  })
})

describe('freehandStroke', () => {
  const options = { passes: 6, closeWithin: 10 }

  it('refuse un simple clic', () => {
    expect(freehandStroke([{ x: 0, y: 0 }], options)).toBeNull()
    expect(freehandStroke([], options)).toBeNull()
  })

  it('referme un tracé revenu près de son départ', () => {
    // Refermer change tout : le texte peut alors tourner sans fin plutôt que de
    // s'arrêter net à deux millimètres de son début.
    const loop: Point[] = []
    for (let i = 0; i < 60; i++) {
      const angle = (2 * Math.PI * i) / 60
      loop.push({ x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) })
    }
    loop.push({ x: 100, y: 2 })

    const stroke = freehandStroke(loop, options)
    expect(stroke?.closed).toBe(true)
  })

  it('laisse ouvert un tracé qui finit loin de son départ', () => {
    const stroke = freehandStroke(shaky(200, 1), options)
    expect(stroke?.closed).toBe(false)
  })

  it('retire le point de recollement d’un tracé fermé', () => {
    // Le dernier point doit rester à un pas du premier, jamais dessus.
    const loop: Point[] = []
    for (let i = 0; i < 40; i++) {
      const angle = (2 * Math.PI * i) / 40
      loop.push({ x: 50 * Math.cos(angle), y: 50 * Math.sin(angle) })
    }
    const duplicated = [...loop, { ...loop[0]! }]

    const stroke = freehandStroke(duplicated, { ...options, passes: 0 })
    expect(stroke?.closed).toBe(true)
    expect(stroke?.points).toHaveLength(loop.length)
  })

  it('écarte les positions confondues que renvoie un pointeur immobile', () => {
    const stalled = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
      { x: 120, y: 0 },
    ]
    const stroke = freehandStroke(stalled, { ...options, passes: 0 })
    expect(stroke?.points).toHaveLength(4)
  })
})
