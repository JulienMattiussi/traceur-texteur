import { polylineLength } from '@/lib/geometry'
import { cleanUpGraph } from '@/lib/graph-cleanup'
import { inkedIn, NEIGHBOURS_8 } from '@/lib/mask'
import type { GraphEdge, GraphNode, Mask, Point, SkeletonGraph } from '@/lib/types'

export interface GraphOptions {
  /**
   * Longueur en pixels sous laquelle une arête borgne (une seule extrémité
   * libre) est considérée comme un artefact de squelettisation et supprimée.
   */
  pruneSpursBelow?: number
}

/**
 * Convertit un squelette 1 px en graphe : les sommets sont les extrémités et
 * les jonctions, les arêtes sont les chaînes de pixels entre deux sommets.
 *
 * Chaque arête devient ensuite un tracé sur lequel écrire. Contrairement au
 * suivi de contour, qui ne rend que la silhouette, le squelette garde
 * l'intérieur du dessin : l'oeil, le museau, les moustaches. En échange il
 * fabrique beaucoup de traits courts, sur lesquels une phrase ne se lit plus.
 * C'est pour ça que les deux modes coexistent (voir `trace.ts`).
 *
 * Module porté de traceur-compteur, où il est documenté en détail.
 */
export function buildGraph(skeleton: Mask, options: GraphOptions = {}): SkeletonGraph {
  const { width, height, data } = skeleton
  const { pruneSpursBelow = 0 } = options

  const inked = inkedIn(skeleton)

  const xOf = (p: number): number => p % width
  const yOf = (p: number): number => (p - (p % width)) / width

  // Degré pixel par pixel : le nombre de voisins encrés.
  const pixelDegree = new Uint8Array(width * height)
  const inkedPixels: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (data[p] !== 1) continue
      let count = 0
      for (const [dx, dy] of NEIGHBOURS_8) {
        if (inked(x + dx, y + dy)) count++
      }
      pixelDegree[p] = count
      inkedPixels.push(p)
    }
  }

  // Un pixel de degré 2 est au milieu d'un trait. Tout le reste (extrémité,
  // jonction, pixel isolé) est un sommet. Les pixels-sommets voisins sont
  // fusionnés : une jonction en Y occupe souvent 2 ou 3 pixels.
  const nodeIdOf = new Int32Array(width * height).fill(-1)
  const nodes: GraphNode[] = []
  const nodePixels: number[][] = []

  const claimNode = (seed: number): number => {
    const id = nodes.length
    const blob: number[] = []
    const stack = [seed]
    nodeIdOf[seed] = id

    while (stack.length > 0) {
      const p = stack.pop()!
      blob.push(p)
      const x = xOf(p)
      const y = yOf(p)
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx
        const ny = y + dy
        if (!inked(nx, ny)) continue
        const q = ny * width + nx
        if (pixelDegree[q] === 2 || nodeIdOf[q] !== -1) continue
        nodeIdOf[q] = id
        stack.push(q)
      }
    }

    let sumX = 0
    let sumY = 0
    for (const p of blob) {
      sumX += xOf(p)
      sumY += yOf(p)
    }
    nodes.push({ id, x: sumX / blob.length, y: sumY / blob.length, degree: 0 })
    nodePixels.push(blob)
    return id
  }

  /** Sommet réduit à un seul pixel, pour clore une chaîne là où elle s'arrête. */
  const forceNode = (pixel: number): number => {
    const id = nodes.length
    nodeIdOf[pixel] = id
    nodes.push({ id, x: xOf(pixel), y: yOf(pixel), degree: 0 })
    nodePixels.push([pixel])
    return id
  }

  for (const p of inkedPixels) {
    if (pixelDegree[p] === 2 || nodeIdOf[p] !== -1) continue
    claimNode(p)
  }

  const edges: GraphEdge[] = []
  const walked = new Uint8Array(width * height)
  const directLinks = new Set<string>()

  const addEdge = (a: number, b: number, points: Point[]): void => {
    edges.push({ id: edges.length, a, b, points, length: polylineLength(points, false) })
  }

  /**
   * Suit une chaîne de pixels de degré 2 depuis un sommet jusqu'au sommet
   * suivant. On privilégie toujours un pixel de chaîne non visité avant de
   * terminer sur un sommet : sans cela, une chaîne qui longe en diagonale le
   * blob dont elle sort y serait immédiatement rebouclée.
   */
  const walkChain = (fromNode: number, entry: number, exitAt: number): void => {
    const points: Point[] = [{ x: xOf(entry), y: yOf(entry) }]
    let previous = entry
    let current = exitAt

    for (;;) {
      walked[current] = 1
      points.push({ x: xOf(current), y: yOf(current) })

      const x = xOf(current)
      const y = yOf(current)
      let nextChain = -1
      let nextNode = -1

      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx
        const ny = y + dy
        if (!inked(nx, ny)) continue
        const q = ny * width + nx
        if (q === previous) continue
        if (nodeIdOf[q] !== -1) {
          if (nextNode === -1) nextNode = q
        } else if (!walked[q] && nextChain === -1) {
          nextChain = q
        }
      }

      if (nextChain !== -1) {
        previous = current
        current = nextChain
        continue
      }

      if (nextNode !== -1) {
        points.push({ x: xOf(nextNode), y: yOf(nextNode) })
        addEdge(fromNode, nodeIdOf[nextNode]!, points)
      } else {
        // Impasse : la chaîne butte sur des pixels déjà parcourus. On crée un
        // sommet là où elle s'arrête. La refermer sur son point de départ en
        // ferait une boucle géométriquement fausse, avec un segment fantôme
        // traversant tout le dessin.
        addEdge(fromNode, forceNode(current), points)
      }
      return
    }
  }

  const exploreNode = (nodeId: number): void => {
    for (const p of nodePixels[nodeId]!) {
      const x = xOf(p)
      const y = yOf(p)
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx
        const ny = y + dy
        if (!inked(nx, ny)) continue
        const q = ny * width + nx

        const neighbourNode = nodeIdOf[q]!
        if (neighbourNode === nodeId) continue

        if (neighbourNode !== -1) {
          // Deux sommets collés : arête sans pixel intermédiaire.
          const key = p < q ? `${p}:${q}` : `${q}:${p}`
          if (directLinks.has(key)) continue
          directLinks.add(key)
          addEdge(nodeId, neighbourNode, [
            { x, y },
            { x: nx, y: ny },
          ])
          continue
        }

        if (walked[q]) continue
        walkChain(nodeId, p, q)
      }
    }
  }

  for (const node of nodes) exploreNode(node.id)

  // Boucles pures (un cercle isolé) : aucun pixel n'a un degré différent de 2,
  // donc aucun sommet n'a été créé. On en fabrique un arbitrairement.
  for (const p of inkedPixels) {
    if (nodeIdOf[p] !== -1 || walked[p]) continue
    exploreNode(claimNode(p))
  }

  return cleanUpGraph({ nodes, edges }, pruneSpursBelow)
}
