import type { Point } from '@/lib/types'

/**
 * Géométrie pure sur des lignes brisées. Rien ici ne connaît la notion de texte.
 *
 * Le pas constant est le choix structurant : une fois le tracé rééchantillonné à
 * intervalle fixe, l'abscisse curviligne se lit comme un index, et tout ce qui
 * suit (tangente, courbure, place libre, avance du texte) devient de
 * l'arithmétique sur des tableaux plutôt qu'une recherche dans une courbe.
 */

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Longueur d'une ligne brisée, segment de fermeture compris si elle est fermée. */
export function polylineLength(points: Point[], closed: boolean): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!)
  if (closed) total += distance(points[points.length - 1]!, points[0]!)
  return total
}

/** Retire les points confondus, qui rendraient toute tangente indéfinie. */
export function dedupe(points: Point[], epsilon = 1e-6): Point[] {
  const kept: Point[] = []
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (!last || distance(last, point) > epsilon) kept.push(point)
  }
  return kept
}

export interface Sampling {
  points: Point[]
  /**
   * Espacement réellement utilisé. Il diffère un peu du pas demandé, et c'est
   * indispensable : tout le moteur lit l'abscisse curviligne comme `index * step`,
   * donc si les échantillons ne couvrent pas exactement le tracé, l'erreur
   * s'accumule sur toute sa longueur.
   */
  step: number
}

/**
 * Rééchantillonne à pas constant, en ajustant le pas pour couvrir le tracé
 * exactement.
 *
 * Deux cas, et les deux ont demandé une correction. Sur un tracé **ouvert**, un pas
 * fixe laissait jusqu'à un pas entier sans échantillon à la fin, donc autant de
 * tracé sans texte : les échantillons sont donc répartis pour tomber pile sur les
 * deux extrémités. Sur un tracé **fermé**, l'espacement doit diviser la longueur
 * totale, sinon le retour au point de départ ne coïncide pas avec l'abscisse
 * calculée ; mesuré sur un cercle, l'écart atteignait 1 % de la longueur, ce qui se
 * voit comme une couture sur une spirale de vingt tours.
 *
 * Dans les deux cas le dernier échantillon d'un tracé fermé reste à un pas du
 * premier, jamais collé dessus : sinon le tracé porterait deux fois le même point
 * et la pose du texte y écrirait un caractère en double.
 */
export function resample(points: Point[], closed: boolean, step: number): Sampling {
  const source = dedupe(points)
  if (source.length === 0) return { points: [], step }
  if (source.length === 1) return { points: [source[0]!], step }

  const path = closed ? [...source, source[0]!] : source
  const total = polylineLength(source, closed)
  if (total < step * 2) return { points: [source[0]!], step }

  // Fermé : `count` intervalles font le tour, le dernier ramenant au départ.
  // Ouvert : `count` intervalles relient les deux extrémités, d'où un point de plus.
  const intervals = Math.max(closed ? 3 : 1, Math.round(total / step))
  const spacing = total / intervals
  const count = closed ? intervals : intervals + 1
  const out: Point[] = []

  let segment = 0
  let consumed = 0
  let segmentLength = distance(path[0]!, path[1]!)

  for (let i = 0; i < count; i++) {
    const target = i * spacing

    while (consumed + segmentLength < target && segment < path.length - 2) {
      consumed += segmentLength
      segment++
      segmentLength = distance(path[segment]!, path[segment + 1]!)
    }

    const a = path[segment]!
    const b = path[segment + 1]!
    const t = segmentLength > 0 ? Math.min(1, (target - consumed) / segmentLength) : 0
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }

  return { points: out, step: spacing }
}

/** Ramène un écart d'angle dans (-pi, pi], sans quoi tout passage par pi ferait un saut. */
export function wrapAngle(angle: number): number {
  let wrapped = angle
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI
  while (wrapped <= -Math.PI) wrapped += 2 * Math.PI
  return wrapped
}

/**
 * Index voisin : on boucle sur un tracé fermé, on bute sur un tracé ouvert.
 *
 * Exporté parce que `relax.ts` en a besoin exactement de la même façon, et que deux
 * copies de cette arithmétique auraient fini par différer sur le signe du modulo.
 */
export function wrapIndex(index: number, offset: number, count: number, closed: boolean): number {
  if (closed) return (((index + offset) % count) + count) % count
  return Math.max(0, Math.min(count - 1, index + offset))
}

/**
 * Tangente en chaque échantillon, mesurée sur une fenêtre plutôt qu'entre deux
 * points voisins.
 *
 * Un tracé issu d'un dessin ou de la souris est en escalier : la tangente
 * mesurée d'un pixel au suivant ne prend que huit valeurs, et le texte
 * tressauterait. La fenêtre est exprimée en nombre d'échantillons, donc en
 * longueur réelle, ce qui rend le résultat indépendant du pas.
 */
export function tangentAngles(points: Point[], window: number, closed: boolean): number[] {
  const count = points.length
  const angles = new Array<number>(count)
  if (count < 2) return angles.fill(0)

  for (let i = 0; i < count; i++) {
    const before = points[wrapIndex(i, -window, count, closed)]!
    const after = points[wrapIndex(i, window, count, closed)]!
    // Sur un tracé ouvert, les bords voient une fenêtre tronquée ; si elle
    // dégénère en un seul point, on retombe sur les voisins immédiats.
    if (before === after) {
      const a = points[Math.max(0, i - 1)]!
      const b = points[Math.min(count - 1, i + 1)]!
      angles[i] = Math.atan2(b.y - a.y, b.x - a.x)
    } else {
      angles[i] = Math.atan2(after.y - before.y, after.x - before.x)
    }
  }

  return angles
}

/**
 * Courbure signée, en 1/pixel : la variation de la tangente rapportée à la longueur
 * d'arc réellement parcourue. Son inverse est le rayon du virage, qui est la
 * grandeur décidant vraiment de la taille maximale lisible du texte.
 */
export function curvatures(
  points: Point[],
  angles: number[],
  window: number,
  closed: boolean,
): number[] {
  const count = angles.length
  const out = new Array<number>(count).fill(0)
  if (count < 3) return out

  // Longueurs cumulées, pour obtenir l'arc entre deux échantillons par une simple
  // soustraction. On divise par l'arc **mesuré** et non par `fenêtre x pas` : c'est
  // la même chose sur un échantillonnage régulier, mais `relax.ts` déforme le tracé
  // sans le rééchantillonner, et supposer un pas constant y sous-estimait la
  // courbure de vingt pour cent.
  const arc = new Float64Array(count + 1)
  for (let i = 1; i <= count; i++) {
    const previous = points[i - 1]!
    const current = points[i % count]!
    arc[i] = arc[i - 1]! + Math.hypot(current.x - previous.x, current.y - previous.y)
  }
  const total = arc[count]!

  for (let i = 0; i < count; i++) {
    const before = wrapIndex(i, -window, count, closed)
    const after = wrapIndex(i, window, count, closed)
    if (before === after) continue

    // Sur un tracé fermé, la fenêtre peut enjamber le point de recollement : l'arc
    // se lit alors en deux morceaux, la fin puis le début.
    const span = after > before ? arc[after]! - arc[before]! : total - arc[before]! + arc[after]!
    if (span <= 0) continue

    out[i] = wrapAngle(angles[after]! - angles[before]!) / span
  }

  return out
}

/** Longueur totale portée par une suite d'échantillons à pas constant. */
export function sampledLength(count: number, step: number, closed: boolean): number {
  if (count < 2) return 0
  return closed ? count * step : (count - 1) * step
}

/**
 * Où tombe l'abscisse curviligne `s` dans un tableau d'échantillons : entre les
 * indices `i` et `j`, à la fraction `t`.
 *
 * Les trois interpolations qui suivent ne diffèrent que par la façon de mélanger
 * les deux valeurs encadrantes ; c'est ce repérage qu'elles ont en commun, et le
 * dupliquer trois fois faisait trois endroits où se tromper sur le bouclage.
 */
function locate(count: number, s: number, step: number, closed: boolean) {
  const position = s / step
  const floor = Math.floor(position)
  const i = wrapIndex(floor, 0, count, closed)
  return { i, j: wrapIndex(i, 1, count, closed), t: position - floor }
}

/** Interpole une valeur d'un tableau échantillonné à l'abscisse curviligne `s`. */
export function sampleAt(values: number[], s: number, step: number, closed: boolean): number {
  const count = values.length
  if (count === 0) return 0
  if (count === 1) return values[0]!

  const { i, j, t } = locate(count, s, step, closed)
  return values[i]! + (values[j]! - values[i]!) * t
}

/** Même interpolation, mais sur des angles : passer par pi ne doit pas faire un demi-tour. */
export function angleAt(angles: number[], s: number, step: number, closed: boolean): number {
  const count = angles.length
  if (count === 0) return 0
  if (count === 1) return angles[0]!

  const { i, j, t } = locate(count, s, step, closed)
  return angles[i]! + wrapAngle(angles[j]! - angles[i]!) * t
}

export function pointAt(points: Point[], s: number, step: number, closed: boolean): Point {
  const count = points.length
  if (count === 0) return { x: 0, y: 0 }
  if (count === 1) return points[0]!

  const { i, j, t } = locate(count, s, step, closed)
  const a = points[i]!
  const b = points[j]!
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
