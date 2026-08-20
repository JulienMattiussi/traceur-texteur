import { describe, expect, it } from 'vitest'
import { fitOnce } from '@/lib/fit'
import { flowText, type FlowOptions } from '@/lib/flow'
import { HELVETICA } from '@/lib/fonts'
import { measureClearances } from '@/lib/clearance'
import { curvatures, resample, sampledLength, tangentAngles, wrapAngle } from '@/lib/geometry'
import { advanceOf, bandHeight } from '@/lib/metrics'
import { countOverlaps } from '@/lib/quality'
import { sizeField } from '@/lib/sizing'
import type { Ribbon, Stroke } from '@/lib/types'
import { circle, line } from '../fixtures'

const OPTIONS: Omit<FlowOptions, 'repeat' | 'scale'> = {
  font: HELVETICA,
  text: 'abc def',
  separator: ' ',
  tracking: 0,
}

/** Ruban complet à partir d'un tracé, avec une place libre imposée. */
function build(stroke: Stroke, clearance: number, step = 1): Ribbon {
  const { points, step: actual } = resample(stroke.points, stroke.closed, step)
  const angles = tangentAngles(points, 4, stroke.closed)
  return {
    points,
    angles,
    curvatures: curvatures(points, angles, 4, stroke.closed),
    clearances: points.map(() => clearance),
    step: actual,
    length: sampledLength(points.length, actual, stroke.closed),
    closed: stroke.closed,
  }
}

const field = (ribbon: Ribbon, maxSize: number, minSize = 0) => [
  sizeField(ribbon, {
    font: HELVETICA,
    maxSize,
    minSize,
    fillRatio: 1,
    bendRatio: 2,
    slope: 0,
  }),
]

describe('flowText', () => {
  it('pose les caractères le long du tracé, dans l’ordre', () => {
    const ribbon = build(line(400), 1000)
    const { glyphs } = flowText([ribbon], field(ribbon, 20), {
      ...OPTIONS,
      repeat: false,
      scale: 1,
    })

    // Les espaces ne produisent pas de glyphe, mais avancent.
    expect(glyphs.map((glyph) => glyph.char).join('')).toBe('abcdef')
    for (let i = 1; i < glyphs.length; i++) {
      expect(glyphs[i]!.x).toBeGreaterThan(glyphs[i - 1]!.x)
    }
  })

  it('n’écrit jamais d’espace en début de tracé', () => {
    const ribbon = build(line(400), 1000)
    const { glyphs } = flowText([ribbon], field(ribbon, 20), {
      ...OPTIONS,
      text: '   abc',
      repeat: false,
      scale: 1,
    })
    expect(glyphs[0]!.char).toBe('a')
  })

  it('espace les caractères de leur avance exacte, à plat', () => {
    const ribbon = build(line(400), 1000)
    const { glyphs } = flowText([ribbon], field(ribbon, 20), {
      ...OPTIONS,
      text: 'nnnn',
      repeat: false,
      scale: 1,
    })

    const expected = advanceOf(HELVETICA, 'n', glyphs[0]!.size)
    for (let i = 1; i < glyphs.length; i++) {
      expect(glyphs[i]!.x - glyphs[i - 1]!.x).toBeCloseTo(expected, 4)
    }
  })

  it('écarte les caractères dans un virage, pour dégager le bord intérieur', () => {
    // Un caractère est un bloc rigide posé tangentiellement : avancer de sa seule
    // avance laisserait le suivant empiéter du côté intérieur du virage. La
    // correction doit valoir exactement le rapport des rayons des deux bords de la
    // bande.
    const radius = 60
    const size = 12
    const ribbon = build(circle(radius), 1000)

    const { glyphs } = flowText([ribbon], field(ribbon, size), {
      ...OPTIONS,
      text: 'nnnnnnnn',
      repeat: false,
      scale: 1,
    })

    // L'angle balayé autour du centre, et non la distance entre les deux lettres :
    // celles-ci sont posées sur un cercle concentrique plus petit que le tracé (la
    // bande d'encre est centrée dessus), donc leur corde ne mesure pas l'arc
    // parcouru sur le tracé.
    const swept = Math.abs(
      wrapAngle(Math.atan2(glyphs[2]!.y, glyphs[2]!.x) - Math.atan2(glyphs[1]!.y, glyphs[1]!.x)),
    )
    const arc = swept * radius
    const flat = advanceOf(HELVETICA, 'n', size)

    expect(arc).toBeGreaterThan(flat)
    expect(arc / flat).toBeCloseTo(1 + bandHeight(HELVETICA, size) / (2 * radius), 3)
  })

  it('répète le texte jusqu’au bout du tracé', () => {
    const ribbon = build(line(1000), 1000)
    const result = flowText([ribbon], field(ribbon, 10), { ...OPTIONS, repeat: true, scale: 1 })

    expect(result.repetitions).toBeGreaterThan(1)
    expect(result.truncated).toBe(false)
    // Il ne reste pas la place d'un caractère de plus.
    expect(ribbon.length - result.consumed).toBeLessThan(
      advanceOf(HELVETICA, 'W', result.maxSize) * 1.5,
    )
  })

  it('ne dépasse jamais la fin du tracé', () => {
    const ribbon = build(line(200), 1000)
    const result = flowText([ribbon], field(ribbon, 30), { ...OPTIONS, repeat: true, scale: 1 })
    expect(result.consumed).toBeLessThanOrEqual(ribbon.length)
  })

  it('signale un texte qui ne tient pas, plutôt que de le tronquer en silence', () => {
    const ribbon = build(line(30), 1000)
    const result = flowText([ribbon], field(ribbon, 30), {
      ...OPTIONS,
      text: 'un message beaucoup trop long pour ce tracé',
      repeat: false,
      scale: 1,
    })
    expect(result.truncated).toBe(true)
  })

  it('enjambe les portions trop étroites au lieu d’y empiler des lettres', () => {
    const ribbon = build(line(400), 1000)
    const [full] = field(ribbon, 20, 0)
    // On bloque artificiellement le tiers central du tracé.
    const blocked = full!.blocked.map((_, index) => index > 120 && index < 260)
    const patched = [{ ...full!, blocked }]

    const result = flowText([ribbon], patched, {
      ...OPTIONS,
      text: 'n',
      repeat: true,
      scale: 1,
    })

    expect(result.skipped).toBeGreaterThan(100)
    for (const glyph of result.glyphs) {
      const blockedHere = glyph.x > 120 && glyph.x < 260
      expect(blockedHere).toBe(false)
    }
  })

  it('ignore une réduction supérieure à 1, qui violerait la place libre', () => {
    const ribbon = build(line(400), 1000)
    const normal = flowText([ribbon], field(ribbon, 20), { ...OPTIONS, repeat: true, scale: 1 })
    const forced = flowText([ribbon], field(ribbon, 20), { ...OPTIONS, repeat: true, scale: 4 })
    expect(forced.maxSize).toBe(normal.maxSize)
  })

  it('ne pose rien avec un texte vide', () => {
    const ribbon = build(line(400), 1000)
    const result = flowText([ribbon], field(ribbon, 20), {
      ...OPTIONS,
      text: '',
      repeat: true,
      scale: 1,
    })
    expect(result.glyphs).toHaveLength(0)
    expect(result.available).toBeGreaterThan(0)
  })

  it('continue le message d’un tracé au suivant', () => {
    const first = build(line(60), 1000)
    const second = build(line(60, 200), 1000)
    const fields = [...field(first, 12), ...field(second, 12)]

    const result = flowText([first, second], fields, {
      ...OPTIONS,
      text: 'abcdefghijklmnopqrstuvwxyz',
      repeat: false,
      scale: 1,
    })

    // Les lettres du second tracé sont bien celles qui suivent, pas un nouveau départ.
    const onSecond = result.glyphs.filter((glyph) => glyph.y > 100)
    expect(onSecond.length).toBeGreaterThan(0)
    expect(onSecond[0]!.char).not.toBe('a')
  })
})

describe('fitOnce', () => {
  it('réduit un texte trop long jusqu’à ce qu’il tombe pile', () => {
    const ribbon = build(line(300), 1000)
    const text = 'un message assez long pour ne pas tenir a pleine taille sur ce trace'
    const result = fitOnce([ribbon], field(ribbon, 40), { ...OPTIONS, text })

    expect(result.truncated).toBe(false)
    // Il remplit presque tout : c'est l'objet même du mode.
    expect(result.consumed / result.available).toBeGreaterThan(0.9)
  })

  it('laisse le tracé nu plutôt que de grossir au-delà de la place libre', () => {
    // Un texte court sur un long tracé ne peut pas être agrandi : le champ de
    // tailles est déjà le plus grand corps qui ne chevauche rien. Le dire est
    // plus honnête que de faire semblant.
    const ribbon = build(line(2000), 40)
    const result = fitOnce([ribbon], field(ribbon, 20), { ...OPTIONS, text: 'court' })

    expect(result.truncated).toBe(false)
    expect(result.consumed / result.available).toBeLessThan(0.2)
  })
})

describe('la promesse du moteur', () => {
  it('ne laisse aucune lettre en recouvrir une autre, sur une spirale serrée', () => {
    // Le cas qui a motivé tout le projet : les tours se resserrent, une taille
    // constante ferait mordre les lettres d'un tour sur celles du voisin.
    const points: { x: number; y: number }[] = []
    for (let angle = 0; angle <= 2 * Math.PI * 8; angle += 0.02) {
      const radius = 20 + (180 * angle) / (2 * Math.PI * 8)
      points.push({ x: 300 + radius * Math.cos(angle), y: 300 + radius * Math.sin(angle) })
    }

    const ribbon = build({ points, closed: false }, 0, 2)
    // Place libre réellement mesurée, et non imposée : c'est elle qui borne la
    // taille, et un test qui l'imposerait ne vérifierait plus rien.
    const cap = bandHeight(HELVETICA, 60)
    ribbon.clearances = measureClearances([ribbon], { cap, gate: cap * 2 })[0]!
    const spiralField = field(ribbon, 60, 0)

    const result = flowText([ribbon], spiralField, {
      ...OPTIONS,
      text: 'traceur texteur ',
      repeat: true,
      scale: 1,
    })

    expect(result.glyphs.length).toBeGreaterThan(100)
    expect(countOverlaps(result.glyphs, HELVETICA)).toBe(0)
  })
})
