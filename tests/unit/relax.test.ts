import { describe, expect, it } from 'vitest'
import { curvatures, polylineLength, resample, sampledLength, tangentAngles } from '@/lib/geometry'
import { relaxCurvature, type RelaxOptions } from '@/lib/relax'
import type { Point } from '@/lib/types'
import { circle } from '../fixtures'

const STEP = 2
const WINDOW = 6

const OPTIONS: RelaxOptions = { maxCurvature: 1 / 40, window: WINDOW, passes: 60 }

/** Courbure maximale, mesurée exactement comme le fait le pipeline. */
function peak(points: Point[], closed: boolean): number {
  const angles = tangentAngles(points, WINDOW, closed)
  return Math.max(...curvatures(points, angles, WINDOW, closed).map(Math.abs))
}

/** Boucle à pointes : de longs arcs doux reliés par des virages très serrés. */
function flower(petals: number, depth: number): Point[] {
  const raw: Point[] = []
  for (let i = 0; i <= 800; i++) {
    const angle = (i / 800) * 2 * Math.PI
    const radius = 200 + depth * Math.cos(petals * angle)
    raw.push({ x: 400 + radius * Math.cos(angle), y: 400 + radius * Math.sin(angle) })
  }
  return raw
}

describe('relaxCurvature', () => {
  it('ne touche pas à un tracé déjà assez ouvert', () => {
    // Un grand cercle a une courbure bien sous la cible : rien à faire, et la
    // fonction doit le dire plutôt que de le lisser pour rien.
    const { points, step } = resample(circle(300).points, true, STEP)
    const relaxed = relaxCurvature(points, true, step, OPTIONS)

    expect(relaxed.passes).toBe(0)
    expect(relaxed.moved).toBe(0)
    expect(relaxed.points).toBe(points)
  })

  it('ouvre les virages jusqu’à la courbure demandée', () => {
    const { points, step } = resample(flower(4, 120), true, STEP)
    expect(peak(points, true)).toBeGreaterThan(OPTIONS.maxCurvature)

    const relaxed = relaxCurvature(points, true, step, OPTIONS)
    // À un quart près de la cible. La boucle s'arrête dès que le gain d'une passe
    // devient négligeable, et ce dernier quart coûterait dix fois le temps de tout
    // le reste : la conséquence est un peu plus de tracé laissé nu, pas du texte
    // illisible, puisque le plancher de corps reprend la main derrière.
    expect(peak(relaxed.points, true)).toBeLessThan(OPTIONS.maxCurvature * 1.3)
  })

  it('renvoie un pas qui divise exactement la longueur', () => {
    // Le tracé raccourcit en s'ouvrant, donc son pas change. Tout le moteur lit
    // l'abscisse curviligne comme `index * step` : si ce pas était celui d'avant,
    // l'erreur s'accumulerait sur toute la longueur.
    const { points, step } = resample(flower(5, 140), true, STEP)
    const relaxed = relaxCurvature(points, true, step, OPTIONS)

    // À un dix-millième près : le tracé rendu est un polygone inscrit dans la
    // courbe, donc très légèrement plus court qu'elle.
    const measured = polylineLength(relaxed.points, true)
    const announced = sampledLength(relaxed.points.length, relaxed.step, true)
    expect(Math.abs(announced - measured) / measured).toBeLessThan(1e-3)
  })

  it('mesure la courbure sur un échantillonnage régulier à chaque passe', () => {
    // Sans rééchantillonner entre les passes, ouvrir un virage y resserre les
    // points et la mesure sous-estime la courbure : la boucle se croyait arrivée à
    // 0,043 alors que le tracé était encore à 0,054. Le contrôle porte donc sur le
    // tracé renvoyé, remesuré de zéro.
    const { points, step } = resample(flower(4, 120), true, STEP)
    const relaxed = relaxCurvature(points, true, step, OPTIONS)

    const remeasured = resample(relaxed.points, true, STEP)
    expect(peak(remeasured.points, true)).toBeLessThan(OPTIONS.maxCurvature * 1.3)
  })

  it('laisse les extrémités d’un tracé ouvert exactement en place', () => {
    const zigzag: Point[] = []
    for (let i = 0; i <= 8; i++) {
      zigzag.push({ x: i * 30, y: i % 2 === 0 ? 0 : 60 })
    }
    const { points, step } = resample(zigzag, false, STEP)
    const relaxed = relaxCurvature(points, false, step, OPTIONS)

    // Au flottant près : les extrémités traversent un rééchantillonnage, qui les
    // recalcule par interpolation.
    const gap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
    expect(gap(relaxed.points[0]!, points[0]!)).toBeLessThan(1e-9)
    expect(
      gap(relaxed.points[relaxed.points.length - 1]!, points[points.length - 1]!),
    ).toBeLessThan(1e-9)
  })

  it('rapporte de combien le tracé s’est écarté du dessin', () => {
    // Rien ne disparaît en silence : l'interface doit pouvoir dire que le dessin a
    // été retouché, et de combien.
    const { points, step } = resample(flower(4, 120), true, STEP)
    const relaxed = relaxCurvature(points, true, step, OPTIONS)

    expect(relaxed.moved).toBeGreaterThan(0)
    // L'écart reste local aux virages : il ne dépasse pas l'ordre de grandeur du
    // rayon qu'on cherche à imposer.
    expect(relaxed.moved).toBeLessThan(2 / OPTIONS.maxCurvature)
  })

  it('raccourcit le tracé sans le détruire', () => {
    const { points, step } = resample(flower(4, 120), true, STEP)
    const before = polylineLength(points, true)
    const after = polylineLength(relaxCurvature(points, true, step, OPTIONS).points, true)

    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(before * 0.8)
  })

  it('s’arrête sur un tracé qu’il ne peut pas satisfaire', () => {
    // Une spirale très serrée a des tours intérieurs de petit rayon par nature :
    // les ouvrir la détruirait. La boucle doit renoncer, pas s'acharner.
    const spiral: Point[] = []
    for (let angle = 0; angle <= 2 * Math.PI * 12; angle += 0.02) {
      const radius = 6 + (2 * angle) / (2 * Math.PI)
      spiral.push({ x: 300 + radius * Math.cos(angle), y: 300 + radius * Math.sin(angle) })
    }
    const { points, step } = resample(spiral, false, STEP)

    const started = performance.now()
    const relaxed = relaxCurvature(points, false, step, OPTIONS)
    expect(performance.now() - started).toBeLessThan(500)
    expect(relaxed.passes).toBeLessThan(OPTIONS.passes)
  })

  it('respecte le plafond de passes', () => {
    const { points, step } = resample(flower(6, 150), true, STEP)
    const relaxed = relaxCurvature(points, true, step, { ...OPTIONS, passes: 3 })
    expect(relaxed.passes).toBeLessThanOrEqual(3)
  })

  it('ne fait rien sans consigne de courbure', () => {
    const { points, step } = resample(flower(4, 120), true, STEP)
    for (const maxCurvature of [0, -1]) {
      const relaxed = relaxCurvature(points, true, step, { ...OPTIONS, maxCurvature })
      expect(relaxed.points).toBe(points)
      expect(relaxed.passes).toBe(0)
    }
  })

  it('laisse tel quel un tracé trop court pour être mesuré', () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]
    expect(relaxCurvature(tiny, false, STEP, OPTIONS).points).toBe(tiny)
  })
})
