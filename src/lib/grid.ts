/**
 * Index spatial : ranger des points dans une grille pour ne comparer que les
 * voisins proches au lieu de tout le monde.
 *
 * Trois calculs du projet en ont besoin, et pour la même raison : ils cherchent,
 * pour chaque point d'un tracé de plusieurs dizaines de milliers d'échantillons,
 * le point le plus proche parmi tous les autres. En force brute c'est quadratique,
 * donc impraticable ; avec une grille au pas de la distance recherchée, tout
 * candidat utile tombe dans l'une des neuf cellules autour de la cellule
 * interrogée, et le coût redevient linéaire.
 *
 * Seule la **construction** est partagée : les trois parcours diffèrent
 * franchement. `clearance.ts` et `quality.ts` balayent les neuf cellules voisines,
 * `relax.ts` élargit par anneaux jusqu'à trouver. Les factoriser derrière une
 * seule fonction de parcours aurait demandé une abstraction plus grosse que les
 * trois boucles réunies, et dans la boucle la plus chaude du projet.
 */

/**
 * Décale les coordonnées de cellule pour qu'elles restent positives : les grilles
 * indexent des points qui peuvent sortir légèrement du cadre.
 */
const CELL_ORIGIN = 1 << 15

/**
 * Identifiant numérique d'une cellule.
 *
 * Une clé chaîne (`"12,7"`) marche aussi mais coûte une allocation par lecture, et
 * ces grilles sont lues neuf fois par point sur des dizaines de milliers de points :
 * mesuré, le passage au nombre a divisé le temps de calcul de la place libre par
 * trois.
 */
function cellKey(cellX: number, cellY: number): number {
  return (cellX + CELL_ORIGIN) * 65536 + (cellY + CELL_ORIGIN)
}

export interface CellGrid {
  /**
   * Côté d'une cellule. C'est aussi la portée de la recherche : au-delà, un voisin
   * peut tomber hors des neuf cellules balayées.
   */
  cell: number
  /** Coordonnée de cellule d'une abscisse ou d'une ordonnée. */
  cellOf(coordinate: number): number
  /** Les indices rangés dans une cellule, ou `undefined` si elle est vide. */
  bucketAt(cellX: number, cellY: number): number[] | undefined
}

/**
 * Range `count` indices dans une grille, d'après les coordonnées que les deux
 * accesseurs renvoient.
 *
 * Ce sont des indices et non des points : les appelants ont déjà leurs tableaux, et
 * ça évite d'en recopier le contenu.
 */
export function buildCellGrid(
  count: number,
  cell: number,
  xOf: (index: number) => number,
  yOf: (index: number) => number,
): CellGrid {
  // Une cellule de côté nul ferait diverger toutes les divisions.
  const side = Math.max(cell, 1e-6)
  const buckets = new Map<number, number[]>()

  for (let index = 0; index < count; index++) {
    const key = cellKey(Math.floor(xOf(index) / side), Math.floor(yOf(index) / side))
    const bucket = buckets.get(key)
    if (bucket) bucket.push(index)
    else buckets.set(key, [index])
  }

  return {
    cell: side,
    cellOf: (coordinate) => Math.floor(coordinate / side),
    bucketAt: (cellX, cellY) => buckets.get(cellKey(cellX, cellY)),
  }
}
