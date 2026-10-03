import { curvatures, resample, tangentAngles, wrapIndex } from '@/lib/geometry'
import { buildCellGrid } from '@/lib/grid'
import type { Point } from '@/lib/types'

/**
 * Élargit les virages trop serrés pour porter du texte lisible.
 *
 * Le plafond de courbure de `sizing.ts` répond à un angle serré en rétrécissant le
 * texte, ce qui est correct mais pas toujours souhaitable : sur une boucle à
 * pointes, un tiers des lettres tombait sous deux millimètres et demi, c'est-à-dire
 * sous le seuil de lisibilité. Deux sorties existent, et elles ne se valent pas.
 *
 * Enjamber la pointe garde le tracé exact mais laisse des trous et coupe les mots.
 * L'autre, ici, retourne le problème : au lieu de rétrécir le texte pour tenir dans
 * le virage, on élargit le virage pour tenir le texte. Le tracé s'écarte un peu du
 * dessin dans les angles, et cet écart est mesuré et rapporté.
 *
 * Ce n'est pas une nouveauté dans le projet, c'est une généralisation : les formes
 * de base arrondissent déjà leurs angles, et pour exactement cette raison. Un
 * dessin déposé et un geste à la souris n'avaient pas droit au même traitement.
 *
 * Le critère n'est pas un réglage esthétique mais une conséquence du corps
 * minimal : on relâche juste assez pour que la courbure ne dicte jamais un corps
 * inférieur à lui. Au-delà, le tracé n'est plus touché.
 */

export interface RelaxOptions {
  /** Courbure au-delà de laquelle un virage est relâché, en 1/pixel. */
  maxCurvature: number
  /** Fenêtre de mesure, en échantillons. La même que celle du pipeline. */
  window: number
  /** Plafond de passes, pour qu'un tracé impossible à satisfaire s'arrête quand même. */
  maxPasses: number
}

export interface Relaxed {
  points: Point[]
  /** Espacement des points renvoyés : le tracé s'étant raccourci, il a changé. */
  step: number
  /** Écart maximal entre le tracé renvoyé et celui reçu, en pixels. */
  moved: number
  /** Nombre de passes réellement effectuées. */
  passes: number
}

/**
 * Force du relâchement à chaque passe. Assez faible pour que la correction reste
 * locale, assez forte pour converger en quelques dizaines de passes.
 */
const STRENGTH = 0.35

/**
 * Gain minimal sur la courbure la plus forte d'une passe à la suivante. En dessous,
 * le tracé ne s'ouvre plus et continuer ne ferait que le rétrécir.
 */
const PROGRESS = 0.995

/**
 * Côté de la grille qui sert à mesurer l'écart au tracé d'origine, en pixels. Il
 * fixe la portée d'un anneau de recherche : assez large pour trouver un voisin du
 * premier coup, assez étroit pour ne pas ramener la moitié du dessin.
 */
const CELL = 32

export function relaxCurvature(
  points: Point[],
  closed: boolean,
  step: number,
  options: RelaxOptions,
): Relaxed {
  const { maxCurvature, window, maxPasses } = options
  if (points.length < 3 || maxCurvature <= 0) {
    return { points, step, moved: 0, passes: 0 }
  }

  const origin = points
  let current = points
  let spacing = step
  let used = 0
  let previousWorst = Infinity

  for (let pass = 0; pass < maxPasses; pass++) {
    const angles = tangentAngles(current, window, closed)
    const bend = curvatures(current, angles, window, closed)

    let worst = 0
    for (const curvature of bend) worst = Math.max(worst, Math.abs(curvature))
    if (worst <= maxCurvature) break

    // Progrès négligeable : on s'arrête là. Certains tracés ne peuvent pas s'ouvrir
    // davantage sans cesser d'être eux-mêmes, et le centre d'une spirale de vingt
    // tours en est l'exemple : ses tours intérieurs ont un petit rayon par nature.
    // Sans ce test, ces cas consommaient les soixante passes pour rien, soit un
    // demi-millier de millisecondes qui rendaient les curseurs inutilisables.
    if (worst > previousWorst * PROGRESS) break
    previousWorst = worst

    const count = current.length
    const next = current.slice()

    for (let i = 0; i < count; i++) {
      // Les extrémités d'un tracé ouvert restent en place : les déplacer
      // raccourcirait le trait à chaque passe.
      if (!closed && (i === 0 || i === count - 1)) continue

      // Le relâchement est proportionnel au dépassement, ce qui le fait mourir de
      // lui-même sur les bords de la zone fautive. Appliqué en tout ou rien, il
      // créerait une cassure là où il s'arrête.
      const excess = Math.abs(bend[i]!) / maxCurvature - 1
      if (excess <= 0) continue
      const weight = STRENGTH * Math.min(1, excess)

      const before = current[wrapIndex(i, -window, count, closed)]!
      const after = current[wrapIndex(i, window, count, closed)]!
      const point = current[i]!

      // Vers le milieu des deux voisins à la distance de la fenêtre, et non des
      // voisins immédiats : c'est à l'échelle où la courbure est mesurée que le
      // virage doit s'ouvrir.
      next[i] = {
        x: point.x + weight * ((before.x + after.x) / 2 - point.x),
        y: point.y + weight * ((before.y + after.y) / 2 - point.y),
      }
    }

    // Rééchantillonner à chaque passe, et non une seule fois à la fin.
    //
    // Ce n'est pas qu'une question de propreté : ouvrir un virage y resserre les
    // points, donc les voisins à `window` indices s'en rapprochent aussi, et le
    // lissage se met à agir à une échelle de plus en plus petite. Il cesse alors
    // d'ouvrir le virage. Mesuré sur une boucle à quatre pointes, s'en passer
    // laissait 119 mm de tracé nu au lieu de 48.
    const again = resample(next, closed, step)
    if (again.points.length < 3) break

    current = again.points
    spacing = again.step
    used = pass + 1
  }

  if (used === 0) return { points: origin, step, moved: 0, passes: 0 }

  return {
    points: current,
    step: spacing,
    moved: deviation(current, origin),
    passes: used,
  }
}

/**
 * Écart maximal entre deux tracés : pour chaque point du premier, la distance au
 * point le plus proche du second.
 *
 * Comparer les points de même indice ne marcherait pas, le tracé s'étant raccourci :
 * les indices ne désignent plus le même endroit de la courbe.
 */
function deviation(points: Point[], reference: Point[]): number {
  const grid = buildCellGrid(
    reference.length,
    CELL,
    (index) => reference[index]!.x,
    (index) => reference[index]!.y,
  )

  let worst = 0

  for (const point of points) {
    const cellX = grid.cellOf(point.x)
    const cellY = grid.cellOf(point.y)
    let best = Infinity

    // Un anneau à la fois, en s'arrêtant dès qu'un voisin trouvé est plus proche
    // que le bord de l'anneau suivant : chercher plus loin ne pourrait plus rien
    // améliorer.
    for (let ring = 0; ring < 8; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue
          const bucket = grid.bucketAt(cellX + dx, cellY + dy)
          if (!bucket) continue
          for (const index of bucket) {
            const other = reference[index]!
            best = Math.min(best, Math.hypot(other.x - point.x, other.y - point.y))
          }
        }
      }
      if (best <= ring * CELL) break
    }

    if (best !== Infinity && best > worst) worst = best
  }

  return worst
}
