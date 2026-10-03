import { describe, expect, it } from 'vitest'
import { binarize, otsuThreshold, rgbaToGray } from '@/lib/binarize'
import { traceContours } from '@/lib/contour'
import { polylineLength } from '@/lib/geometry'
import { orderStrokes, traceImage } from '@/lib/trace'
import { filledRectangle, grayRectangle } from '../fixtures'

describe('binarize', () => {
  it('sépare exactement l’encre du papier, seuil calculé', () => {
    // Ce qui compte n'est pas la valeur du seuil mais la coupure qu'il produit :
    // sur une image franchement bimodale, Otsu s'arrête sur la valeur de l'encre
    // elle-même, et la comparaison large la retient.
    const gray = grayRectangle(40, 40, { x: 10, y: 10, width: 20, height: 20 })
    const mask = binarize(gray, 40, 40, { threshold: 'auto' })

    for (let i = 0; i < gray.length; i++) {
      expect(mask.data[i], `pixel ${i}`).toBe(gray[i] === 0 ? 1 : 0)
    }
  })

  it('reste entre les deux modes sur une image en dégradé', () => {
    const gray = new Uint8Array(256 * 4)
    for (let i = 0; i < gray.length; i++) gray[i] = i % 2 === 0 ? 30 : 220
    const threshold = otsuThreshold(gray)
    expect(threshold).toBeGreaterThanOrEqual(30)
    expect(threshold).toBeLessThan(220)
  })

  it('traite le transparent comme du papier, pas comme de l’encre', () => {
    // Un PNG à fond transparent doit donner une page blanche, pas une page noire.
    const rgba = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255])
    const gray = rgbaToGray(rgba)
    expect(gray[0]).toBe(255)
    expect(gray[1]).toBe(0)
  })

  it('écarte les taches trop petites pour être un trait', () => {
    const gray = grayRectangle(60, 60, { x: 5, y: 5, width: 2, height: 2 })
    const kept = binarize(gray, 60, 60, { threshold: 128, minBlobArea: 0 })
    const dropped = binarize(gray, 60, 60, { threshold: 128, minBlobArea: 10 })
    expect(kept.data.reduce((sum, value) => sum + value, 0)).toBe(4)
    expect(dropped.data.reduce((sum, value) => sum + value, 0)).toBe(0)
  })
})

describe('traceContours', () => {
  it('rend une boucle fermée par tache d’encre', () => {
    const mask = filledRectangle(60, 60, { x: 10, y: 10, width: 20, height: 20 })
    const strokes = traceContours(mask)

    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.closed).toBe(true)
  })

  it('suit le périmètre, et non la surface', () => {
    // 20 par 20 : le tour fait 4 x 19 pas, la surface en ferait 400.
    const mask = filledRectangle(60, 60, { x: 10, y: 10, width: 20, height: 20 })
    const [stroke] = traceContours(mask)
    expect(polylineLength(stroke!.points, true)).toBeCloseTo(4 * 19, 0)
  })

  it('ne retrace pas la même tache deux fois', () => {
    const mask = filledRectangle(80, 40, { x: 5, y: 5, width: 30, height: 30 })
    for (let y = 5; y < 35; y++) {
      for (let x = 45; x < 75; x++) mask.data[y * 80 + x] = 1
    }
    expect(traceContours(mask)).toHaveLength(2)
  })

  it('ignore un pixel isolé, qui n’a pas de contour à suivre', () => {
    const mask = filledRectangle(20, 20, { x: 10, y: 10, width: 1, height: 1 })
    expect(traceContours(mask)).toHaveLength(0)
  })
})

describe('traceImage', () => {
  const gray = grayRectangle(80, 80, { x: 20, y: 20, width: 40, height: 40 })

  it('rend une seule boucle en mode contour', () => {
    const strokes = traceImage(gray, 80, 80, { mode: 'contour', threshold: 128 })
    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.closed).toBe(true)
  })

  it('rend l’axe médian en mode squelette, plus court que le contour', () => {
    // Une barre épaisse s'amincit en une ligne unique, deux fois plus courte que
    // son tour. C'est la différence qui compte pour écrire du texte, et c'est
    // pourquoi le contour est le mode par défaut : il offre plus de longueur.
    const bar = grayRectangle(80, 80, { x: 10, y: 37, width: 60, height: 6 })
    const contour = traceImage(bar, 80, 80, { mode: 'contour', threshold: 128 })
    const skeleton = traceImage(bar, 80, 80, { mode: 'squelette', threshold: 128 })

    const total = (strokes: typeof contour) =>
      strokes.reduce((sum, stroke) => sum + polylineLength(stroke.points, stroke.closed), 0)

    expect(skeleton).toHaveLength(1)
    expect(skeleton[0]!.closed).toBe(false)
    expect(total(skeleton)).toBeCloseTo(53, 0)
    expect(total(skeleton)).toBeLessThan(total(contour) / 2)
  })

  it('ne rend rien du squelette d’une forme pleine et compacte', () => {
    // Zhang-Suen ramène un carré parfait à un seul pixel : son axe médian dégénère.
    // Ce n'est pas un défaut de l'implémentation mais une propriété de
    // l'amincissement, et c'est une raison de plus de suivre le contour par défaut.
    expect(traceImage(gray, 80, 80, { mode: 'squelette', threshold: 128 })).toHaveLength(0)
  })

  it('ne rend rien sur une page blanche', () => {
    const blank = new Uint8Array(40 * 40).fill(255)
    expect(traceImage(blank, 40, 40, { mode: 'contour', threshold: 128 })).toHaveLength(0)
  })
})

describe('orderStrokes', () => {
  it('range du plus long au plus court', () => {
    // L'ordre décide où tombent les premiers mots : sur le tracé le plus long, donc
    // le plus lisible.
    const short = {
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      closed: false,
    }
    const long = {
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      closed: false,
    }
    const medium = {
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      closed: false,
    }

    const ordered = orderStrokes([short, long, medium], 0)
    expect(ordered.map((stroke) => stroke.points[1]!.x)).toEqual([200, 50, 5])
  })

  it('écarte ce qui est trop court pour porter plus d’une syllabe', () => {
    const short = {
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      closed: false,
    }
    const long = {
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      closed: false,
    }
    expect(orderStrokes([short, long], 50)).toHaveLength(1)
  })
})
