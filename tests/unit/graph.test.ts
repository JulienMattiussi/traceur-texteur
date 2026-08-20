import { describe, expect, it } from 'vitest'
import { buildGraph } from '@/lib/graph'
import { polylineLength } from '@/lib/geometry'
import type { Mask } from '@/lib/types'

/**
 * Le squelette vers le graphe, et ses trois nettoyages.
 *
 * Module porté de traceur-compteur, mais testé ici : la règle du projet est que
 * `src/lib` est entièrement testé, et les nettoyages ne s'exerçaient jusqu'ici que
 * sur de vrais dessins, donc jamais dans la suite. Les squelettes sont dessinés à
 * la main sur un pixel d'épaisseur, ce qui rend la réponse attendue connue : un
 * cercle est un trait, un T en fait trois.
 */

function mask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) }
}

function plot(target: Mask, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return
  target.data[y * target.width + x] = 1
}

function line(target: Mask, fromX: number, fromY: number, toX: number, toY: number): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY))
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    plot(target, Math.round(fromX + (toX - fromX) * t), Math.round(fromY + (toY - fromY) * t))
  }
}

/** Cercle discret : son escalier de diagonales est ce qui pollue le graphe. */
function ring(target: Mask, centre: number, radius: number): void {
  const step = 1 / (radius * 4)
  for (let angle = 0; angle < 2 * Math.PI; angle += step) {
    plot(
      target,
      Math.round(centre + radius * Math.cos(angle)),
      Math.round(centre + radius * Math.sin(angle)),
    )
  }
}

describe('buildGraph', () => {
  it('rend un cercle en un seul trait fermé', () => {
    // C'est l'invariant qui justifie `dissolveDegreeTwoNodes` : un cercle numérique
    // produit des dizaines de pixels à trois voisins rien qu'à cause de l'escalier
    // des diagonales, et sans les dissoudre le cercle ressortirait en autant de
    // traits.
    const skeleton = mask(80, 80)
    ring(skeleton, 40, 30)

    const graph = buildGraph(skeleton, {})

    expect(graph.edges).toHaveLength(1)
    // Un trait qui se referme sur lui-même : ses deux extrémités sont le même sommet.
    expect(graph.edges[0]!.a).toBe(graph.edges[0]!.b)

    // Et il fait bien tout le tour, non un fragment. La chaîne de pixels
    // sous-estime la circonférence d'environ 15 % : en huit-connexité, un pas
    // diagonal compte 1,41 alors qu'il couvre un pixel dans chaque axe, donc
    // davantage de courbe. C'est une propriété de la discrétisation, pas une perte.
    const length = polylineLength(graph.edges[0]!.points, false)
    const circumference = 2 * Math.PI * 30
    expect(length).toBeGreaterThan(circumference * 0.8)
    expect(length).toBeLessThanOrEqual(circumference)
  })

  it('rend un T en trois traits autour d’une jonction', () => {
    const skeleton = mask(60, 60)
    line(skeleton, 10, 20, 50, 20)
    line(skeleton, 30, 20, 30, 50)

    const graph = buildGraph(skeleton, {})

    expect(graph.edges).toHaveLength(3)
    const junctions = graph.nodes.filter((node) => node.degree >= 3)
    expect(junctions).toHaveLength(1)
    expect(junctions[0]!.x).toBeCloseTo(30, 0)
  })

  it('garde les deux extrémités d’un trait simple', () => {
    const skeleton = mask(40, 20)
    line(skeleton, 5, 10, 34, 10)

    const graph = buildGraph(skeleton, {})

    expect(graph.edges).toHaveLength(1)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes.every((node) => node.degree === 1)).toBe(true)
  })

  it('ébarbe les barbules courtes, et seulement elles', () => {
    // La squelettisation d'un trait épais ou irrégulier en produit beaucoup ; elles
    // ne portent aucune information de dessin mais fabriquent des jonctions.
    const withBarb = () => {
      const skeleton = mask(60, 60)
      line(skeleton, 10, 30, 50, 30)
      // Barbule de cinq pixels, greffée au milieu.
      line(skeleton, 30, 30, 30, 25)
      return skeleton
    }

    expect(buildGraph(withBarb(), { pruneSpursBelow: 0 }).edges).toHaveLength(3)

    const pruned = buildGraph(withBarb(), { pruneSpursBelow: 12 })
    // La barbule part, et les deux moitiés du trait se recollent en un seul.
    expect(pruned.edges).toHaveLength(1)
    expect(pruned.nodes.filter((node) => node.degree >= 3)).toHaveLength(0)
  })

  it('ne coupe pas un vrai trait sous prétexte qu’il est court', () => {
    // L'ébarbage ne doit toucher que les arêtes borgnes greffées sur une jonction.
    const skeleton = mask(40, 40)
    line(skeleton, 5, 20, 20, 20)

    expect(buildGraph(skeleton, { pruneSpursBelow: 100 }).edges).toHaveLength(1)
  })

  it('ne rend rien d’un masque vide ou d’un pixel isolé', () => {
    expect(buildGraph(mask(20, 20), {}).edges).toHaveLength(0)

    const lonely = mask(20, 20)
    plot(lonely, 10, 10)
    const graph = buildGraph(lonely, {})
    expect(graph.edges).toHaveLength(0)
    // Un sommet sans arête est retiré : il ne porterait aucun texte.
    expect(graph.nodes).toHaveLength(0)
  })

  it('sépare deux formes qui ne se touchent pas', () => {
    const skeleton = mask(80, 40)
    line(skeleton, 5, 20, 30, 20)
    line(skeleton, 50, 20, 74, 20)

    const graph = buildGraph(skeleton, {})
    expect(graph.edges).toHaveLength(2)
    expect(graph.nodes).toHaveLength(4)
  })

  it('numérote sommets et arêtes sans trou après nettoyage', () => {
    // Les nettoyages filtrent des tableaux ; si la renumérotation était fautive,
    // une arête pointerait vers un sommet supprimé.
    const skeleton = mask(60, 60)
    line(skeleton, 10, 30, 50, 30)
    line(skeleton, 30, 30, 30, 25)

    const graph = buildGraph(skeleton, { pruneSpursBelow: 12 })

    expect(graph.nodes.map((node) => node.id)).toEqual(graph.nodes.map((_, index) => index))
    expect(graph.edges.map((edge) => edge.id)).toEqual(graph.edges.map((_, index) => index))
    const ids = new Set(graph.nodes.map((node) => node.id))
    for (const edge of graph.edges) {
      expect(ids.has(edge.a)).toBe(true)
      expect(ids.has(edge.b)).toBe(true)
    }
  })
})
