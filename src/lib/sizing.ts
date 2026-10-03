import type { FontMetrics } from '@/lib/fonts'
import { sizeForBand } from '@/lib/metrics'
import type { Ribbon } from '@/lib/types'

/**
 * Quel corps de police écrire en chaque point du tracé ?
 *
 * Deux contraintes indépendantes bornent la taille, et la plus sévère gagne :
 *
 * 1. **La place libre.** La bande d'encre du texte est centrée sur le tracé,
 *    donc elle en déborde de sa demi-hauteur de chaque côté. Deux portions
 *    distantes de `d` se recouvrent dès que la bande dépasse `d`, chacune ayant
 *    droit à sa moitié du couloir.
 *
 * 2. **Le virage.** Un texte posé dans un virage de rayon `r` a son bord
 *    intérieur au rayon `r - bande/2`. Quand la bande approche `2r`, ce bord
 *    passe par le centre du virage et le mot se replie sur lui-même. On exige
 *    donc un rayon confortablement plus grand que la bande.
 *
 * Ces deux plafonds ne sont pas redondants, ils se complètent : le premier voit
 * les rapprochements lointains (deux tours de spirale) mais pas les replis
 * courts, que la porte de `clearance.ts` écarte volontairement ; le second voit
 * exactement ces replis, puisqu'un tracé ne peut revenir sur lui-même en peu de
 * longueur sans tourner fort.
 *
 * Le champ brut qui en résulte est ensuite **lissé**, faute de quoi le texte
 * changerait de corps d'une lettre à l'autre.
 */

export interface SizingOptions {
  font: FontMetrics
  /** Corps maximal, en pixels, quelle que soit la place disponible. */
  maxSize: number
  /**
   * Corps minimal. C'est un plancher de lisibilité : là où même lui ne tiendrait
   * pas, l'échantillon est marqué bloqué et le texte l'enjambe, ce qui est compté.
   */
  minSize: number
  /** Part du couloir disponible que le texte occupe. En dessous de 1, il reste de l'air. */
  fillRatio: number
  /** Rapport minimal exigé entre le rayon du virage et la hauteur de la bande. */
  bendRatio: number
  /** Variation maximale du corps par pixel parcouru. Zéro fige la taille. */
  slope: number
}

export interface SizeField {
  sizes: number[]
  /**
   * Échantillons où même le corps minimal ne tiendrait pas. Le texte les
   * enjambe : écrire là produirait des lettres empilées, illisibles et fausses.
   * C'est le seul endroit du moteur qui renonce, et il le fait explicitement
   * plutôt qu'en laissant le texte se recouvrir.
   */
  blocked: boolean[]
  /** Nombre d'échantillons ainsi enjambés. */
  cramped: number
}

/**
 * Le plus grand champ qui respecte à la fois les plafonds et une pente maximale.
 *
 * Une moyenne glissante serait plus naturelle mais fausse : elle relève la
 * taille au-dessus de son plafond dans les creux étroits, donc réintroduit
 * exactement les chevauchements qu'on vient d'écarter. Deux balayages de
 * minimums, l'un dans chaque sens, donnent le résultat optimal sans jamais
 * dépasser aucun plafond, en une passe linéaire.
 */
export function limitSlope(sizes: number[], step: number, slope: number, closed: boolean): void {
  if (slope <= 0 || sizes.length < 2) return

  const rise = slope * step
  const count = sizes.length
  // Un tracé fermé demande deux tours : une contrainte née juste après le point
  // de recollement doit pouvoir se propager jusqu'avant lui.
  const laps = closed ? 2 : 1

  for (let lap = 0; lap < laps; lap++) {
    for (let i = 1; i < count; i++) {
      const previous = sizes[i - 1]!
      if (sizes[i]! > previous + rise) sizes[i] = previous + rise
    }
    if (closed && sizes[0]! > sizes[count - 1]! + rise) sizes[0] = sizes[count - 1]! + rise
  }

  for (let lap = 0; lap < laps; lap++) {
    for (let i = count - 2; i >= 0; i--) {
      const next = sizes[i + 1]!
      if (sizes[i]! > next + rise) sizes[i] = next + rise
    }
    if (closed && sizes[count - 1]! > sizes[0]! + rise) sizes[count - 1] = sizes[0]! + rise
  }
}

export function sizeField(ribbon: Ribbon, options: SizingOptions): SizeField {
  const { font, maxSize, minSize, fillRatio, bendRatio, slope } = options
  const count = ribbon.points.length
  const sizes = new Array<number>(count)

  for (let i = 0; i < count; i++) {
    // 1. La place libre : la bande doit tenir dans le couloir.
    let size = sizeForBand(font, ribbon.clearances[i]! * fillRatio)

    // 2. Le virage : la bande doit rester petite devant le rayon.
    const curvature = Math.abs(ribbon.curvatures[i]!)
    if (curvature > 0) {
      const fromBend = sizeForBand(font, 1 / (curvature * bendRatio))
      if (fromBend < size) size = fromBend
    }

    sizes[i] = Math.min(size, maxSize)
  }

  limitSlope(sizes, ribbon.step, slope, ribbon.closed)

  // Le plancher s'applique en dernier : appliqué avant, le lissage l'aurait
  // repropagé et écrasé la taille bien au-delà de la zone réellement étroite.
  const blocked = new Array<boolean>(count).fill(false)
  let cramped = 0
  for (let i = 0; i < count; i++) {
    if (sizes[i]! < minSize) {
      blocked[i] = true
      cramped++
      sizes[i] = minSize
    }
  }

  return { sizes, blocked, cramped }
}
