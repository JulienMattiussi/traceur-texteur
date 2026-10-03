import { describe, expect, it } from 'vitest'
import { buildCellGrid } from '@/lib/grid'
import type { Point } from '@/lib/types'

function gridOf(points: Point[], cell: number) {
  return buildCellGrid(
    points.length,
    cell,
    (index) => points[index]!.x,
    (index) => points[index]!.y,
  )
}

/** Les indices trouvés dans les neuf cellules autour d'un point. */
function near(grid: ReturnType<typeof gridOf>, point: Point): number[] {
  const found: number[] = []
  const cellX = grid.cellOf(point.x)
  const cellY = grid.cellOf(point.y)

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      found.push(...(grid.bucketAt(cellX + dx, cellY + dy) ?? []))
    }
  }
  return found.sort((a, b) => a - b)
}

describe('buildCellGrid', () => {
  it('range chaque indice une seule fois', () => {
    const points = Array.from({ length: 50 }, (_, i) => ({ x: i * 7, y: i * 3 }))
    const grid = gridOf(points, 10)

    const seen = new Set<number>()
    for (let x = -2; x <= 40; x++) {
      for (let y = -2; y <= 20; y++) {
        for (const index of grid.bucketAt(x, y) ?? []) {
          expect(seen.has(index), `indice ${index} vu deux fois`).toBe(false)
          seen.add(index)
        }
      }
    }
    expect(seen.size).toBe(points.length)
  })

  it('trouve tout voisin à moins d’une cellule', () => {
    // C'est l'invariant dont dépendent les trois calculs qui s'en servent : chercher
    // dans les neuf cellules autour suffit, à condition que la cellule fasse au
    // moins la portée voulue. Le vérifier en force brute est le seul moyen honnête.
    const points: Point[] = []
    for (let i = 0; i < 300; i++) {
      // Grille irrégulière, avec des amas et du vide.
      points.push({ x: (i * 37) % 211, y: (i * 91) % 173 })
    }

    const cell = 25
    const grid = gridOf(points, cell)

    for (let i = 0; i < points.length; i++) {
      const expected = points
        .map((point, index) => ({
          index,
          gap: Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y),
        }))
        .filter((entry) => entry.gap <= cell)
        .map((entry) => entry.index)
        .sort((a, b) => a - b)

      const found = new Set(near(grid, points[i]!))
      for (const index of expected) {
        expect(found.has(index), `voisin ${index} de ${i} manquant`).toBe(true)
      }
    }
  })

  it('accepte les coordonnées négatives', () => {
    // Les tracés peuvent déborder du cadre, et un modulo mal posé sur une clé
    // numérique ferait alors collisionner deux cellules opposées.
    const points: Point[] = [
      { x: -500, y: -500 },
      { x: 500, y: 500 },
      { x: -500, y: 500 },
      { x: 500, y: -500 },
    ]
    const grid = gridOf(points, 10)

    for (let i = 0; i < points.length; i++) {
      expect(near(grid, points[i]!)).toEqual([i])
    }
  })

  it('ne divise jamais par une cellule nulle', () => {
    // Tous les points confondus donnent une portée nulle chez les appelants.
    const grid = gridOf([{ x: 5, y: 5 }], 0)
    expect(grid.cell).toBeGreaterThan(0)
    expect(Number.isFinite(grid.cellOf(5))).toBe(true)
  })

  it('ne trouve rien dans une cellule vide', () => {
    const grid = gridOf([{ x: 0, y: 0 }], 10)
    expect(grid.bucketAt(50, 50)).toBeUndefined()
  })

  it('accepte un ensemble vide', () => {
    const grid = gridOf([], 10)
    expect(grid.bucketAt(0, 0)).toBeUndefined()
  })
})
