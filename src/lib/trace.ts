import { binarize, type BinarizeOptions } from '@/lib/binarize'
import { traceContours } from '@/lib/contour'
import { buildGraph, type GraphOptions } from '@/lib/graph'
import { polylineLength } from '@/lib/geometry'
import { thin } from '@/lib/thin'
import type { Stroke } from '@/lib/types'

/**
 * D'un dessin vers des tracés à écrire.
 *
 * Deux lectures du même dessin, et le choix n'est pas cosmétique :
 *
 * - **contour** ne garde que la silhouette de chaque tache d'encre. Une boucle
 *   fermée par forme, donc de la longueur continue : une phrase entière tient
 *   dessus et se lit.
 * - **squelette** garde aussi l'intérieur (l'oeil, le museau, les moustaches),
 *   au prix de dizaines de fragments courts. Le résultat est un nuage de bouts
 *   de phrase plutôt qu'un texte, ce qui est un effet graphique valable mais
 *   n'est plus de la lecture.
 *
 * Le contour est donc le défaut, à l'inverse exact du parti pris de
 * traceur-compteur, et pour une raison précise : un relier-les-points veut la
 * totalité du dessin, un texte veut de la longueur.
 */

export type TraceMode = 'contour' | 'squelette'

export interface TraceOptions extends BinarizeOptions, GraphOptions {
  mode: TraceMode
}

export function traceImage(
  gray: Uint8Array,
  width: number,
  height: number,
  options: TraceOptions,
): Stroke[] {
  const mask = binarize(gray, width, height, options)

  // Ni filtrés ni rangés ici : la longueur minimale est un réglage de page, en
  // millimètres imprimés, qui ne se compare qu'après cadrage (voir `source.ts`).
  if (options.mode === 'contour') return traceContours(mask)
  return buildGraph(thin(mask), options).edges.map((edge) => ({
    points: edge.points,
    closed: edge.a === edge.b,
  }))
}

/**
 * Écarte les tracés trop courts, puis range du plus long au plus court.
 *
 * L'ordre compte : le texte est posé tracé après tracé, donc le premier reçoit
 * le début du message. Le mettre sur le plus long tracé, c'est mettre les
 * premiers mots là où ils ont le plus de chances d'être lisibles, et reléguer
 * les fragments à la fin.
 */
export function orderStrokes(strokes: Stroke[], minLength: number): Stroke[] {
  return strokes
    .map((stroke) => ({ stroke, length: polylineLength(stroke.points, stroke.closed) }))
    .filter((entry) => entry.length >= minLength)
    .sort((a, b) => b.length - a.length)
    .map((entry) => entry.stroke)
}
