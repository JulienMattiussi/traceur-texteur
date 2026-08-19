import type { GraphEdge, GraphNode, SkeletonGraph } from '@/lib/types'

/**
 * Nettoyages du graphe issu de la squelettisation.
 *
 * La discrétisation pollue ce graphe : un simple cercle numérique produit
 * quarante pixels à trois voisins rien qu'à cause de l'escalier des diagonales.
 * Sans ces trois passes, on compterait des dizaines de fausses jonctions et le
 * dessin serait découpé en bien plus de traits qu'il n'en contient : autant de
 * tracés minuscules, sur chacun desquels le texte n'aurait la place que d'une
 * syllabe.
 *
 * Module porté de traceur-compteur, où il est documenté en détail.
 */
export function cleanUpGraph(graph: SkeletonGraph, pruneSpursBelow: number): SkeletonGraph {
  computeDegrees(graph)
  const pruned = pruneSpursBelow > 0 ? pruneSpurs(graph, pruneSpursBelow) : graph
  return dissolveDegreeTwoNodes(dropIsolatedNodes(dropDegenerateLoops(pruned)))
}

/**
 * Retire les micro-boucles refermées sur un même sommet. Un escalier de
 * discrétisation en produit une à chaque virage à 45 degrés ; elles ne portent
 * aucune information de dessin et empêchent de dissoudre le sommet.
 */
function dropDegenerateLoops(graph: SkeletonGraph, minLength = 4): SkeletonGraph {
  const kept = graph.edges.filter((edge) => edge.a !== edge.b || edge.length >= minLength)
  if (kept.length === graph.edges.length) return graph
  const result: SkeletonGraph = { nodes: graph.nodes, edges: kept }
  computeDegrees(result)
  return result
}

/**
 * Fusionne les traits séparés par un sommet de degré 2.
 *
 * Un tel sommet n'est ni une extrémité ni une jonction : il vient de l'escalier
 * de discrétisation (un cercle numérique produit des dizaines de pixels à trois
 * voisins) ou d'une barbule qu'on vient de retirer. Le recoller est exact, les
 * deux chaînes de pixels se touchent, et ça évite de compter de fausses
 * jonctions puis de multiplier les séquences.
 */
function dissolveDegreeTwoNodes(graph: SkeletonGraph): SkeletonGraph {
  let nodes = graph.nodes
  let edges = graph.edges

  for (;;) {
    computeDegrees({ nodes, edges })

    // Une boucle sur soi compte deux rattachements : sans ça, un sommet portant
    // une boucle plus un trait passerait pour un degré 2, et le fusionner
    // laisserait une arête pointant vers un sommet supprimé.
    const incident = new Map<number, number[]>()
    for (const node of nodes) incident.set(node.id, [])
    for (const edge of edges) {
      incident.get(edge.a)!.push(edge.id)
      incident.get(edge.b)!.push(edge.id)
    }

    const victim = nodes.find((node) => {
      const attached = incident.get(node.id)!
      return attached.length === 2 && attached[0] !== attached[1]
    })
    if (!victim) return reindex(nodes, edges)

    const [firstId, secondId] = incident.get(victim.id)! as [number, number]
    const first = edges.find((edge) => edge.id === firstId)!
    const second = edges.find((edge) => edge.id === secondId)!

    // On oriente la première arête pour qu'elle arrive sur le sommet, la seconde
    // pour qu'elle en repart.
    const incoming = first.b === victim.id ? first.points : [...first.points].reverse()
    const outgoing = second.a === victim.id ? second.points : [...second.points].reverse()
    const from = first.b === victim.id ? first.a : first.b
    const to = second.a === victim.id ? second.b : second.a

    const points = [...incoming]
    for (const point of outgoing) {
      const last = points[points.length - 1]!
      if (last.x === point.x && last.y === point.y) continue
      points.push(point)
    }

    let length = 0
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1]!
      const cur = points[i]!
      length += Math.hypot(cur.x - previous.x, cur.y - previous.y)
    }

    edges = [
      ...edges.filter((edge) => edge.id !== firstId && edge.id !== secondId),
      { id: Math.max(...edges.map((edge) => edge.id)) + 1, a: from, b: to, points, length },
    ]
    nodes = nodes.filter((node) => node.id !== victim.id)
  }
}

/**
 * Recalcule les degrés. Indexé par identifiant et non par position : après un
 * filtrage, les deux ne coïncident plus jusqu'au prochain `reindex`.
 */
function computeDegrees(graph: SkeletonGraph): Map<number, GraphNode> {
  const byId = new Map<number, GraphNode>()
  for (const node of graph.nodes) {
    node.degree = 0
    byId.set(node.id, node)
  }
  for (const edge of graph.edges) {
    const a = byId.get(edge.a)
    const b = byId.get(edge.b)
    if (a) a.degree++
    if (b) b.degree++
  }
  return byId
}

/**
 * Supprime les barbules : de courtes arêtes borgnes que la squelettisation
 * génère sur les traits épais ou irréguliers (les contours en dents de scie
 * d'un coloriage en produisent beaucoup). Itératif, car retirer une barbule
 * peut en révéler une autre.
 */
function pruneSpurs(graph: SkeletonGraph, minLength: number): SkeletonGraph {
  let edges = graph.edges
  const nodes = graph.nodes

  for (;;) {
    const byId = computeDegrees({ nodes, edges })

    const doomed = new Set<number>()
    for (const edge of edges) {
      if (edge.length >= minLength) continue
      if (edge.a === edge.b) continue
      const degreeA = byId.get(edge.a)?.degree ?? 0
      const degreeB = byId.get(edge.b)?.degree ?? 0
      // Borgne : une extrémité libre, l'autre sur une jonction qui survivra.
      const spurAtA = degreeA === 1 && degreeB >= 3
      const spurAtB = degreeB === 1 && degreeA >= 3
      if (spurAtA || spurAtB) doomed.add(edge.id)
    }

    if (doomed.size === 0) return reindex(nodes, edges)
    edges = edges.filter((edge) => !doomed.has(edge.id))
  }
}

function dropIsolatedNodes(graph: SkeletonGraph): SkeletonGraph {
  const used = new Set<number>()
  for (const edge of graph.edges) {
    used.add(edge.a)
    used.add(edge.b)
  }
  if (graph.nodes.every((node) => used.has(node.id))) return graph
  return reindex(
    graph.nodes.filter((node) => used.has(node.id)),
    graph.edges,
  )
}

/** Renumérote sommets et arêtes de 0..n-1 après un filtrage. */
function reindex(nodes: GraphNode[], edges: GraphEdge[]): SkeletonGraph {
  const remap = new Map<number, number>()
  const nextNodes: GraphNode[] = nodes.map((node, index) => {
    remap.set(node.id, index)
    return { ...node, id: index, degree: 0 }
  })

  const nextEdges: GraphEdge[] = []
  for (const edge of edges) {
    const a = remap.get(edge.a)
    const b = remap.get(edge.b)
    if (a === undefined || b === undefined) continue
    nextEdges.push({ ...edge, id: nextEdges.length, a, b })
  }

  const graph: SkeletonGraph = { nodes: nextNodes, edges: nextEdges }
  computeDegrees(graph)
  return graph
}
