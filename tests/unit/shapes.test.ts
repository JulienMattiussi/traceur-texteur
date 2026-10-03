import { describe, expect, it } from 'vitest'
import { curvatures, distance, polylineLength, resample, tangentAngles } from '@/lib/geometry'
import { buildShape, roundCorners, SHAPES, type ShapeOptions } from '@/lib/shapes'
import type { Rect } from '@/lib/types'

const BOX: Rect = { x: 40, y: 40, width: 760, height: 1108 }
const OPTIONS: ShapeOptions = { corner: 32, turns: 7, teeth: 6 }

/** Courbure maximale d'un tracé, mesurée comme le fait le pipeline. */
function peakCurvature(points: { x: number; y: number }[], closed: boolean): number {
  const { points: sampled } = resample(points, closed, 2)
  const angles = tangentAngles(sampled, 6, closed)
  const measured = curvatures(sampled, angles, 12, closed)
  return Math.max(...measured.map(Math.abs))
}

describe('buildShape', () => {
  it('produit un tracé exploitable pour chaque forme annoncée', () => {
    for (const { kind } of SHAPES) {
      const stroke = buildShape(kind, BOX, OPTIONS)
      expect(stroke.points.length, kind).toBeGreaterThan(20)
      expect(polylineLength(stroke.points, stroke.closed), kind).toBeGreaterThan(100)
    }
  })

  it('reste dans son cadre', () => {
    for (const { kind } of SHAPES) {
      for (const point of buildShape(kind, BOX, OPTIONS).points) {
        expect(point.x, kind).toBeGreaterThanOrEqual(BOX.x - 1e-6)
        expect(point.y, kind).toBeGreaterThanOrEqual(BOX.y - 1e-6)
        expect(point.x, kind).toBeLessThanOrEqual(BOX.x + BOX.width + 1e-6)
        expect(point.y, kind).toBeLessThanOrEqual(BOX.y + BOX.height + 1e-6)
      }
    }
  })

  it('ferme les formes qui doivent l’être, et laisse les autres ouvertes', () => {
    expect(buildShape('cercle', BOX, OPTIONS).closed).toBe(true)
    expect(buildShape('rectangle', BOX, OPTIONS).closed).toBe(true)
    expect(buildShape('triangle', BOX, OPTIONS).closed).toBe(true)
    // Une spirale et un zigzag ont un début et une fin.
    expect(buildShape('spirale', BOX, OPTIONS).closed).toBe(false)
    expect(buildShape('zigzag', BOX, OPTIONS).closed).toBe(false)
  })

  const extent = (kind: Parameters<typeof buildShape>[0]) => {
    const points = buildShape(kind, BOX, OPTIONS).points
    return {
      width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
      height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
    }
  }

  it('ovalise le cercle pour remplir le cadre', () => {
    // Un cercle inscrit dans un A4 portrait laisserait un tiers de la feuille vide.
    const { width, height } = extent('cercle')
    expect(width / BOX.width).toBeCloseTo(1, 2)
    expect(height / BOX.height).toBeCloseTo(1, 2)
  })

  it('ovalise la spirale, à un tour près', () => {
    // Elle n'atteint pas exactement le bord : son point le plus haut est le dernier
    // passage par le sommet, qui précède la fin du dernier tour. C'est inhérent à
    // une spirale, pas un défaut de cadrage.
    const { width, height } = extent('spirale')
    expect(width / BOX.width).toBeGreaterThan(0.85)
    expect(width / BOX.width).toBeLessThanOrEqual(1)
    expect(height / BOX.height).toBeGreaterThan(0.85)
    expect(height / BOX.height).toBeLessThanOrEqual(1)
  })

  it('donne à la spirale le nombre de tours demandé', () => {
    for (const turns of [3, 7, 15]) {
      const { points } = buildShape('spirale', BOX, { ...OPTIONS, turns })
      const angles = points.map((point) =>
        Math.atan2(point.y - (BOX.y + BOX.height / 2), point.x - (BOX.x + BOX.width / 2)),
      )
      let swept = 0
      for (let i = 1; i < angles.length; i++) {
        let delta = angles[i]! - angles[i - 1]!
        while (delta > Math.PI) delta -= 2 * Math.PI
        while (delta <= -Math.PI) delta += 2 * Math.PI
        swept += delta
      }
      expect(Math.abs(swept) / (2 * Math.PI)).toBeCloseTo(turns, 1)
    }
  })

  it('borne la courbure des angles, sinon le texte y serait écrasé', () => {
    // Un angle vif a une courbure infinie, et le plafond de courbure y ramènerait
    // le texte au plancher de lisibilité. C'est toute la raison des coins arrondis.
    for (const kind of ['rectangle', 'triangle', 'zigzag'] as const) {
      const sharp = buildShape(kind, BOX, { ...OPTIONS, corner: 0 })
      const rounded = buildShape(kind, BOX, { ...OPTIONS, corner: 40 })
      expect(peakCurvature(rounded.points, rounded.closed), kind).toBeLessThan(
        peakCurvature(sharp.points, sharp.closed),
      )
    }
  })
})

describe('roundCorners', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('ne touche à rien avec un rayon nul', () => {
    expect(roundCorners(square, true, 0)).toEqual(square)
  })

  it('raccourcit le tour, puisqu’il coupe les angles', () => {
    const rounded = roundCorners(square, true, 20)
    expect(polylineLength(rounded, true)).toBeLessThan(polylineLength(square, true))
  })

  it('préserve les extrémités d’un tracé ouvert', () => {
    const open = roundCorners(square, false, 20)
    expect(open[0]).toEqual(square[0])
    expect(open[open.length - 1]).toEqual(square[square.length - 1])
  })

  it('ne dépasse jamais la moitié d’un côté, pour que deux coins ne se mordent pas', () => {
    // Demandé plus grand que la forme, l'arrondi doit se borner tout seul plutôt
    // que de replier le tracé sur lui-même.
    const rounded = roundCorners(square, true, 500)
    for (const point of rounded) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-6)
      expect(point.x).toBeLessThanOrEqual(100 + 1e-6)
      expect(point.y).toBeGreaterThanOrEqual(-1e-6)
      expect(point.y).toBeLessThanOrEqual(100 + 1e-6)
    }
    // Avec un arrondi maximal, le carré devient une forme ronde inscrite : son
    // tour tient entre celui du cercle de rayon 50 et celui du carré. Ce n'est pas
    // un cercle exact, la courbe de Bézier quadratique étant une parabole ; l'écart
    // est de trois pour cent, invisible et sans conséquence sur la courbure.
    const perimeter = polylineLength(rounded, true)
    expect(perimeter).toBeGreaterThan(2 * Math.PI * 50)
    expect(perimeter).toBeLessThan(400)
  })

  it('ne produit aucun point confondu, qui rendrait la tangente indéfinie', () => {
    // Les longs côtés droits restent sans point intermédiaire, et c'est voulu :
    // c'est le rééchantillonnage qui les peuplera. Ce qui casserait tout, en
    // revanche, ce sont deux points au même endroit.
    for (const radius of [1, 20, 50, 500]) {
      const rounded = roundCorners(square, true, radius)
      for (let i = 1; i < rounded.length; i++) {
        expect(distance(rounded[i - 1]!, rounded[i]!), `rayon ${radius}`).toBeGreaterThan(0)
      }
    }
  })
})
