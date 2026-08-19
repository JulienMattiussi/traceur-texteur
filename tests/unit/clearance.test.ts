import { describe, expect, it } from 'vitest'
import { measureClearances, type Sampled } from '@/lib/clearance'
import { resample } from '@/lib/geometry'
import { circle, line, parallelLines } from '../fixtures'

function sample(strokes: { points: { x: number; y: number }[]; closed: boolean }[], step = 2) {
  return strokes.map<Sampled>((stroke) => {
    const { points, step: actual } = resample(stroke.points, stroke.closed, step)
    return { points, closed: stroke.closed, step: actual }
  })
}

describe('measureClearances', () => {
  it('mesure la distance exacte entre deux tracés parallèles', () => {
    const gap = 30
    const strokes = sample(parallelLines(400, gap))
    const [first, second] = measureClearances(strokes, { cap: 100, gate: 200 })

    // Sauf près des bouts, où le tracé voisin s'éloigne en biais, chaque point
    // voit l'autre trait pile en face.
    for (const clearance of first!.slice(20, -20)) expect(clearance).toBeCloseTo(gap, 6)
    for (const clearance of second!.slice(20, -20)) expect(clearance).toBeCloseTo(gap, 6)
  })

  it('ne laisse jamais un tracé se déclarer obstacle à lui-même', () => {
    // C'est tout l'objet de la porte : sur une droite isolée, la place libre est
    // celle du plafond, pas la distance au point voisin.
    const strokes = sample([line(400)])
    const [clearances] = measureClearances(strokes, { cap: 60, gate: 120 })
    for (const clearance of clearances!) expect(clearance).toBe(60)
  })

  it('borne au plafond quand rien n’est plus proche', () => {
    const strokes = sample(parallelLines(400, 500))
    const [clearances] = measureClearances(strokes, { cap: 40, gate: 80 })
    for (const clearance of clearances!) expect(clearance).toBe(40)
  })

  it('voit le bord du cadre comme un obstacle sans texte, donc deux fois plus loin', () => {
    // Le bord ne réclame pas sa moitié du couloir, contrairement à un autre
    // tracé : un texte peut s'en approcher deux fois plus.
    const strokes = sample([line(400, 25)])
    const [clearances] = measureClearances(strokes, {
      cap: 500,
      gate: 1000,
      bounds: { x: 0, y: 0, width: 400, height: 200 },
    })
    // Le trait est à 25 du bord haut : la place vaut donc 50.
    expect(clearances![100]).toBeCloseTo(50, 6)
  })

  it('voit une pointe étroite, que la seule porte le long du tracé manquait', () => {
    // Deux branches qui se rejoignent en pointe : à mi-hauteur elles ne sont
    // qu'à 4 l'une de l'autre, alors qu'il faut parcourir plus de 200 de tracé
    // pour passer de l'une à l'autre. Sans le test de corde, la porte les
    // déclarait voisines et le texte s'y recouvrait.
    const wedge = {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 2 },
        { x: 0, y: 4 },
      ],
      closed: false,
    }
    const strokes = sample([wedge], 1)
    const [clearances] = measureClearances(strokes, { cap: 50, gate: 100 })

    // Au large de la pointe, les deux branches se voient.
    const nearOpening = clearances!.slice(0, 20)
    expect(Math.min(...nearOpening)).toBeLessThan(6)
  })

  it('exige une porte au moins aussi large que le plafond', () => {
    // Cet invariant n'est pas un réglage à tâtonner, c'est une conséquence : sur
    // une courbe douce, deux points distants de L le long du tracé sont à peu près
    // distants de L dans le plan. Une porte plus petite que le plafond fait donc
    // voir à chaque point son propre voisinage comme un obstacle, et le texte
    // devient minuscule partout. C'est pour ça que `pipeline.ts` calcule la porte
    // à partir du plafond, et jamais l'inverse.
    const strokes = sample([circle(30)], 1)

    const [correct] = measureClearances(strokes, { cap: 25, gate: 50 })
    for (const clearance of correct!) expect(clearance).toBe(25)

    const [degenerate] = measureClearances(strokes, { cap: 200, gate: 20 })
    // Le cercle se prend lui-même pour obstacle, à la distance de la porte.
    expect(Math.max(...degenerate!)).toBeLessThan(25)
  })
})
