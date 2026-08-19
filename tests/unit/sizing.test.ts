import { describe, expect, it } from 'vitest'
import { HELVETICA } from '@/lib/fonts'
import { bandHeight, sizeForBand } from '@/lib/metrics'
import { limitSlope, sizeField, type SizingOptions } from '@/lib/sizing'
import type { Ribbon } from '@/lib/types'

const OPTIONS: SizingOptions = {
  font: HELVETICA,
  maxSize: 40,
  minSize: 4,
  fillRatio: 1,
  bendRatio: 2,
  slope: 0,
}

/** Ruban artificiel : on impose directement place libre et courbure. */
function ribbon(clearances: number[], curvatures: number[], closed = false): Ribbon {
  return {
    points: clearances.map((_, index) => ({ x: index, y: 0 })),
    angles: clearances.map(() => 0),
    curvatures,
    clearances,
    step: 1,
    length: closed ? clearances.length : clearances.length - 1,
    closed,
  }
}

describe('sizeField', () => {
  it('fait tenir la bande d’encre dans la place libre', () => {
    // La promesse du projet, dans sa forme la plus directe.
    const clearances = [10, 20, 30, 20, 10]
    const { sizes } = sizeField(ribbon(clearances, [0, 0, 0, 0, 0]), {
      ...OPTIONS,
      minSize: 0,
    })

    for (let i = 0; i < sizes.length; i++) {
      expect(bandHeight(HELVETICA, sizes[i]!)).toBeLessThanOrEqual(clearances[i]! + 1e-9)
    }
  })

  it('laisse de l’air quand on le demande', () => {
    const clearances = [20, 20, 20]
    const full = sizeField(ribbon(clearances, [0, 0, 0]), { ...OPTIONS, fillRatio: 1 })
    const airy = sizeField(ribbon(clearances, [0, 0, 0]), { ...OPTIONS, fillRatio: 0.5 })
    expect(airy.sizes[1]!).toBeCloseTo(full.sizes[1]! / 2, 9)
  })

  it('borne au corps maximal là où la place ne manque pas', () => {
    const { sizes } = sizeField(ribbon([1000, 1000, 1000], [0, 0, 0]), OPTIONS)
    for (const size of sizes) expect(size).toBe(OPTIONS.maxSize)
  })

  it('rétrécit dans les virages, indépendamment de la place libre', () => {
    // Un tracé peut être seul au monde et pourtant tourner trop court : le texte
    // s'y replierait sur lui-même du côté intérieur.
    const radius = 12
    const { sizes } = sizeField(ribbon([1000, 1000, 1000], Array(3).fill(1 / radius)), OPTIONS)

    for (const size of sizes) {
      // La bande doit rester `bendRatio` fois plus petite que le rayon du virage.
      expect(bandHeight(HELVETICA, size)).toBeLessThanOrEqual(radius / OPTIONS.bendRatio + 1e-9)
    }
  })

  it('retient le plus sévère des deux plafonds', () => {
    const tight = sizeField(ribbon([8], [0]), { ...OPTIONS, minSize: 0 })
    const bent = sizeField(ribbon([1000], [1 / 5]), { ...OPTIONS, minSize: 0 })
    const both = sizeField(ribbon([8], [1 / 5]), { ...OPTIONS, minSize: 0 })
    expect(both.sizes[0]!).toBeCloseTo(Math.min(tight.sizes[0]!, bent.sizes[0]!), 9)
  })

  it('marque comme enjambé, et non comme écrit petit, ce qui ne tient pas', () => {
    // C'est le seul endroit du moteur qui renonce, et il le fait explicitement :
    // écrire au plancher dans un couloir plus étroit produirait des lettres
    // empilées.
    const roomy = sizeForBand(HELVETICA, 40)
    const { blocked, cramped, sizes } = sizeField(ribbon([roomy, 1, roomy], [0, 0, 0]), OPTIONS)

    expect(blocked).toEqual([false, true, false])
    expect(cramped).toBe(1)
    // La taille reste au plancher pour que l'interpolation garde un sens.
    expect(sizes[1]!).toBe(OPTIONS.minSize)
  })
})

describe('limitSlope', () => {
  it('ramène la pente sous la limite, dans les deux sens', () => {
    const sizes = [0, 100, 0]
    limitSlope(sizes, 1, 10, false)
    for (let i = 1; i < sizes.length; i++) {
      expect(Math.abs(sizes[i]! - sizes[i - 1]!)).toBeLessThanOrEqual(10 + 1e-9)
    }
  })

  it('ne relève jamais une valeur, seulement en abaisse', () => {
    // Une moyenne glissante remonterait la taille au-dessus de son plafond dans
    // les creux étroits, et réintroduirait les chevauchements qu'on vient
    // d'écarter. Deux balayages de minimums ne peuvent pas faire ça.
    const original = [30, 5, 30, 30, 2, 30]
    const sizes = [...original]
    limitSlope(sizes, 1, 4, false)
    for (let i = 0; i < sizes.length; i++) expect(sizes[i]!).toBeLessThanOrEqual(original[i]!)
  })

  it('propage la contrainte à travers le recollement d’un tracé fermé', () => {
    // Un creux juste après le point de recollement doit se faire sentir juste
    // avant, sinon la taille saute d'un bout à l'autre de la boucle.
    const sizes = [0, 50, 50, 50, 50, 50]
    limitSlope(sizes, 1, 10, true)
    expect(sizes[sizes.length - 1]!).toBeLessThanOrEqual(10 + 1e-9)
  })

  it('ne touche à rien quand la pente autorisée est nulle', () => {
    const sizes = [1, 90, 1]
    limitSlope(sizes, 1, 0, false)
    expect(sizes).toEqual([1, 90, 1])
  })
})
