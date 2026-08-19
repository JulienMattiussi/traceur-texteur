import { cellKey } from '@/lib/geometry'
import type { Point } from '@/lib/types'

/**
 * Combien de place le tracé laisse-t-il autour de lui, en chaque point ?
 *
 * C'est la mesure qui porte tout le projet. Un texte écrit à taille constante le
 * long d'une spirale devient illisible dès que les tours se resserrent : les
 * lettres d'un tour mordent sur celles du tour voisin. La réponse n'est pas de
 * choisir une taille prudente pour toute la page, qui gâcherait les zones aérées,
 * mais de faire varier la taille avec la place réellement disponible.
 *
 * La place disponible en un point, c'est la distance à la portion la plus proche
 * du dessin **qui ne soit pas son propre voisinage** : sur une courbe lisse, les
 * échantillons voisins sont évidemment à côté, et les compter donnerait une place
 * nulle partout. D'où la porte (`gate`), exprimée en longueur le long du tracé.
 *
 * Une porte fondée sur la seule distance le long du tracé ne suffit pourtant pas.
 * Dans la pointe d'une dent de zigzag, les deux branches se longent à moins d'un
 * millimètre alors qu'il faut parcourir plusieurs centimètres de tracé pour
 * passer de l'une à l'autre : la porte les déclarait voisines et le texte s'y
 * recouvrait. Le plafond de courbure n'y voyait rien non plus, la pointe étant
 * arrondie et les branches droites.
 *
 * D'où le second critère : un vrai voisin est aussi un point que **la corde
 * rejoint presque aussi vite que l'arc**. Sur une courbe douce, distance dans le
 * plan et distance le long du tracé sont quasiment égales ; dans un repli ou une
 * pointe, la première s'effondre devant la seconde. Ce rapport les sépare
 * franchement, sans réglage délicat : mesuré, une courbe lisse reste au-dessus
 * de 0,95 et une pointe de dent tombe sous 0,1.
 */

export interface Sampled {
  points: Point[]
  closed: boolean
  step: number
}

export interface ClearanceOptions {
  /**
   * Plafond de recherche, en pixels. Au-delà, la valeur exacte ne changerait
   * plus la taille retenue puisqu'un autre plafond aura pris le relais ; s'en
   * tenir là rend la recherche locale, donc linéaire.
   */
  cap: number
  /**
   * Longueur, le long du tracé, en deçà de laquelle deux échantillons sont
   * considérés comme voisins et ne se gênent pas.
   */
  gate: number
  /**
   * Cadre à ne pas déborder. Le bord compte comme un obstacle, mais un obstacle
   * qui ne porte pas de texte : le tracé peut donc s'en approcher deux fois plus
   * qu'il ne s'approcherait d'un autre tracé, qui lui réclame sa moitié du
   * couloir. Sans ça, un texte écrit sur le contour d'une forme déborde
   * simplement de la page.
   */
  bounds?: { x: number; y: number; width: number; height: number }
}

/**
 * Rapport minimal entre la corde et l'arc pour qu'un point proche le long du
 * tracé compte comme un simple voisin plutôt que comme un obstacle.
 *
 * Le seuil n'est pas critique : une courbe dont la corde tombe sous 0,85 de son
 * arc sur la longueur de la porte a un rayon d'environ dix millimètres, et à ce
 * rayon c'est le plafond de courbure qui décide de toute façon.
 */
const CHORD_RATIO = 0.85

/** Distance le long du tracé entre deux échantillons, en tenant compte du bouclage. */
function alongDistance(i: number, j: number, count: number, step: number, closed: boolean): number {
  const raw = Math.abs(i - j)
  return (closed ? Math.min(raw, count - raw) : raw) * step
}

/** Distance au bord du cadre, ramenée à l'échelle d'un obstacle porteur de texte. */
function borderClearance(x: number, y: number, options: ClearanceOptions): number {
  const { bounds } = options
  if (!bounds) return Infinity
  const gap = Math.min(
    x - bounds.x,
    y - bounds.y,
    bounds.x + bounds.width - x,
    bounds.y + bounds.height - y,
  )
  return Math.max(0, gap) * 2
}

export function measureClearances(strokes: Sampled[], options: ClearanceOptions): number[][] {
  const { cap, gate } = options

  const xs: number[] = []
  const ys: number[] = []
  const owner: number[] = []
  const position: number[] = []

  for (let s = 0; s < strokes.length; s++) {
    const stroke = strokes[s]!
    for (let i = 0; i < stroke.points.length; i++) {
      const point = stroke.points[i]!
      xs.push(point.x)
      ys.push(point.y)
      owner.push(s)
      position.push(i)
    }
  }

  const results = strokes.map((stroke) => new Array<number>(stroke.points.length).fill(cap))
  if (xs.length === 0) return results

  // Grille au pas du plafond : tout candidat à moins de `cap` tombe dans l'une
  // des neuf cellules autour de la cellule du point interrogé.
  const cell = Math.max(cap, 1e-6)
  const buckets = new Map<number, number[]>()

  for (let k = 0; k < xs.length; k++) {
    const key = cellKey(Math.floor(xs[k]! / cell), Math.floor(ys[k]! / cell))
    const bucket = buckets.get(key)
    if (bucket) bucket.push(k)
    else buckets.set(key, [k])
  }

  const capSquared = cap * cap

  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]!
    const y = ys[k]!
    const stroke = strokes[owner[k]!]!
    const border = borderClearance(x, y, options)
    let best = Math.min(capSquared, border * border)

    const cellX = Math.floor(x / cell)
    const cellY = Math.floor(y / cell)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = buckets.get(cellKey(cellX + dx, cellY + dy))
        if (!bucket) continue

        for (const other of bucket) {
          if (other === k) continue

          const ddx = xs[other]! - x
          const ddy = ys[other]! - y
          const squared = ddx * ddx + ddy * ddy
          if (squared >= best) continue

          if (owner[other] === owner[k]) {
            const along = alongDistance(
              position[k]!,
              position[other]!,
              stroke.points.length,
              stroke.step,
              stroke.closed,
            )
            const chord = along * CHORD_RATIO
            if (along <= gate && squared >= chord * chord) continue
          }

          best = squared
        }
      }
    }

    results[owner[k]!]![position[k]!] = Math.sqrt(best)
  }

  return results
}
