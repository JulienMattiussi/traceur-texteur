import { describe, expect, it } from 'vitest'
import {
  angleAt,
  cellKey,
  curvatures,
  dedupe,
  distance,
  pointAt,
  polylineLength,
  resample,
  sampleAt,
  sampledLength,
  tangentAngles,
  wrapAngle,
} from '@/lib/geometry'
import { circle, line } from '../fixtures'

describe('polylineLength', () => {
  it('mesure un segment', () => {
    expect(polylineLength(line(10).points, false)).toBeCloseTo(10, 6)
  })

  it('ajoute le segment de fermeture', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    expect(polylineLength(square, false)).toBeCloseTo(12, 6)
    expect(polylineLength(square, true)).toBeCloseTo(16, 6)
  })

  it('approche le périmètre exact d’un cercle', () => {
    const radius = 50
    const measured = polylineLength(circle(radius).points, true)
    // Un polygone inscrit sous-estime toujours le cercle, jamais l'inverse.
    expect(measured).toBeLessThan(2 * Math.PI * radius)
    expect(measured).toBeCloseTo(2 * Math.PI * radius, 1)
  })
})

describe('dedupe', () => {
  it('retire les points confondus, qui rendraient la tangente indéfinie', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ]
    expect(dedupe(points)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ])
  })
})

describe('resample', () => {
  it('espace les échantillons du pas annoncé', () => {
    const { points, step } = resample(line(100).points, false, 5)
    for (let i = 1; i < points.length; i++) {
      expect(distance(points[i - 1]!, points[i]!)).toBeCloseTo(step, 6)
    }
  })

  it('tombe pile sur les deux extrémités d’un tracé ouvert', () => {
    // Un pas fixe laissait jusqu'à un pas entier de tracé sans échantillon,
    // donc sans texte.
    const { points } = resample(line(100).points, false, 3)
    expect(points[0]!.x).toBeCloseTo(0, 6)
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 6)
  })

  it('renvoie un pas qui divise exactement la longueur', () => {
    // C'est ce qui rend `index * step` égal à l'abscisse curviligne réelle.
    for (const closed of [false, true]) {
      const stroke = closed ? circle(40) : line(100)
      const { points, step } = resample(stroke.points, closed, 4)
      const total = polylineLength(stroke.points, closed)
      expect(sampledLength(points.length, step, closed)).toBeCloseTo(total, 6)
    }
  })

  it('laisse le dernier échantillon à un pas du premier sur un tracé fermé', () => {
    // Sinon le tracé porterait deux fois le même point, et la pose du texte y
    // écrirait un caractère en double.
    const { points, step } = resample(circle(40).points, true, 4)
    expect(distance(points[points.length - 1]!, points[0]!)).toBeCloseTo(step, 1)
  })

  it('renvoie un seul point quand le tracé est trop court pour être échantillonné', () => {
    expect(resample(line(2).points, false, 10).points).toHaveLength(1)
  })
})

describe('wrapAngle', () => {
  it('ramène dans (-pi, pi]', () => {
    expect(wrapAngle(0)).toBeCloseTo(0, 9)
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 9)
    expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 9)
  })
})

describe('tangentAngles', () => {
  it('suit la direction d’un segment', () => {
    const { points } = resample(line(100).points, false, 2)
    for (const angle of tangentAngles(points, 3, false)) {
      expect(angle).toBeCloseTo(0, 6)
    }
  })

  it('tourne d’un tour complet le long d’un cercle', () => {
    const { points } = resample(circle(60).points, true, 2)
    const angles = tangentAngles(points, 3, true)

    let turned = 0
    for (let i = 1; i < angles.length; i++) turned += wrapAngle(angles[i]! - angles[i - 1]!)
    turned += wrapAngle(angles[0]! - angles[angles.length - 1]!)

    expect(Math.abs(turned)).toBeCloseTo(2 * Math.PI, 3)
  })
})

describe('curvatures', () => {
  it('est nulle sur une droite', () => {
    const { points } = resample(line(200).points, false, 2)
    const angles = tangentAngles(points, 4, false)
    for (const curvature of curvatures(points, angles, 4, false)) {
      expect(Math.abs(curvature)).toBeLessThan(1e-9)
    }
  })

  it('vaut l’inverse du rayon sur un cercle', () => {
    for (const radius of [25, 60, 140]) {
      const { points } = resample(circle(radius).points, true, 2)
      const angles = tangentAngles(points, 4, true)
      const measured = curvatures(points, angles, 4, true)

      const average = measured.reduce((sum, value) => sum + Math.abs(value), 0) / measured.length
      // C'est la grandeur qui décide du plafond de taille du texte : une erreur
      // ici se voit directement dans le rendu.
      expect(average).toBeCloseTo(1 / radius, 3)
    }
  })
})

describe('sampledLength', () => {
  it('compte le segment de fermeture sur un tracé fermé', () => {
    expect(sampledLength(10, 2, false)).toBe(18)
    expect(sampledLength(10, 2, true)).toBe(20)
  })
})

describe('interpolation', () => {
  it('interpole linéairement entre deux échantillons', () => {
    expect(sampleAt([0, 10], 0.5, 1, false)).toBeCloseTo(5, 9)
  })

  it('boucle sur un tracé fermé', () => {
    // À un demi-pas après le dernier échantillon, on est à mi-chemin du premier.
    expect(sampleAt([0, 4, 8], 2.5, 1, true)).toBeCloseTo(4, 9)
  })

  it('borne sur un tracé ouvert au lieu de boucler', () => {
    expect(sampleAt([0, 4, 8], 9, 1, false)).toBeCloseTo(8, 9)
  })

  it('interpole les angles sans faire un demi-tour au passage par pi', () => {
    const angles = [Math.PI - 0.1, -Math.PI + 0.1]
    const middle = angleAt(angles, 0.5, 1, false)
    // La moyenne naïve donnerait 0 : un demi-tour au lieu d'un cheveu.
    expect(Math.abs(wrapAngle(middle - Math.PI))).toBeLessThan(0.01)
  })

  it('interpole une position', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ]
    expect(pointAt(points, 0.5, 1, false)).toEqual({ x: 5, y: 10 })
  })
})

describe('cellKey', () => {
  it('distingue toutes les cellules voisines, coordonnées négatives comprises', () => {
    const keys = new Set<number>()
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) keys.add(cellKey(x, y))
    expect(keys.size).toBe(49)
  })
})
