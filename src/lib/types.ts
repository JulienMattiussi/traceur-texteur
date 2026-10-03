/** Types partagés par tout le pipeline. Aucune dépendance, aucun DOM. */

export interface Point {
  x: number
  y: number
}

/** Rectangle aligné sur les axes : zone utile, cadre d'une forme, bord de page. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Les trois familles disponibles, choisies parce que tout lecteur PDF les possède. */
export type FontFamily = 'sans' | 'serif' | 'mono'

/** Image binaire : 1 = encre (un trait du dessin), 0 = fond. */
export interface Mask {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Un sommet du squelette : soit une extrémité de trait (degré 1), soit une
 * jonction où plusieurs traits se rencontrent (degré >= 3).
 */
export interface GraphNode {
  id: number
  x: number
  y: number
  /** Nombre d'extrémités d'arêtes attachées (une boucle sur soi compte 2). */
  degree: number
}

/** Un trait continu entre deux sommets, échantillonné pixel par pixel. */
export interface GraphEdge {
  id: number
  a: number
  b: number
  /** Suite de pixels de `a` vers `b`, extrémités incluses. */
  points: Point[]
  length: number
}

export interface SkeletonGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Une ligne brisée, telle que la fournit une forme, la souris ou un dessin. */
export interface Stroke {
  points: Point[]
  /** Vrai si le dernier point rejoint le premier. */
  closed: boolean
}

/**
 * Un tracé prêt à recevoir du texte : rééchantillonné à pas constant, avec en
 * chaque échantillon sa tangente, sa courbure et la place libre autour de lui.
 *
 * Le pas constant est ce qui rend tout le reste simple : l'abscisse curviligne
 * devient un simple index, donc chercher « où en suis-je après 12 pixels » ne
 * demande aucune recherche.
 */
export interface Ribbon {
  points: Point[]
  /** Direction de la tangente, en radians. */
  angles: number[]
  /** Courbure signée, en 1/pixel. Son inverse est le rayon du virage. */
  curvatures: number[]
  /**
   * Distance à la portion la plus proche du dessin qui ne soit pas un voisin
   * immédiat le long du tracé. Bornée : au-delà du plafond, la valeur exacte
   * ne changerait plus la taille retenue.
   */
  clearances: number[]
  /** Distance entre deux échantillons consécutifs, en pixels. */
  step: number
  length: number
  closed: boolean
}

/** Un caractère posé : tout ce qu'il faut pour le dessiner, et rien de plus. */
export interface Glyph {
  char: string
  /** Position de la ligne de base, au milieu de l'avance du caractère. */
  x: number
  y: number
  /** Rotation autour de ce point, en radians. */
  angle: number
  /** Corps de la police, en pixels. */
  size: number
}

interface CompositionStats {
  /** Nombre de tracés reçus, et longueur cumulée en pixels. */
  strokes: number
  strokeLength: number
  glyphs: number
  /** Nombre de fois que le texte a été écrit en entier. */
  repetitions: number
  /** Part de la longueur du tracé réellement couverte par du texte, de 0 à 1. */
  coverage: number
  /** Longueur enjambée faute de place, en millimètres imprimés. */
  skippedMm: number
  /**
   * Écart maximal, en millimètres imprimés, entre le tracé suivi et celui reçu.
   * Non nul quand des virages ont été élargis pour porter du texte lisible.
   */
  roundedMm: number
  /** Corps de police retenus, en millimètres imprimés. */
  minSizeMm: number
  maxSizeMm: number
  /** Échantillons de tracé trop étroits pour porter le corps minimal, donc enjambés. */
  cramped: number
  /** Paires de glyphes dont les boîtes d'encre se recouvrent. Doit rester à zéro. */
  overlaps: number
  timings: Record<string, number>
}

export interface Composition {
  width: number
  height: number
  glyphs: Glyph[]
  /** Les tracés d'origine, pour pouvoir les afficher sous le texte. */
  strokes: Stroke[]
  family: FontFamily
  colour: string
  stats: CompositionStats
}
