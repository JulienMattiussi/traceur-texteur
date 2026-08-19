import { COURIER, HELVETICA, TIMES, type FontMetrics } from '@/lib/fonts'
import type { FontFamily } from '@/lib/types'

/**
 * Mesure du texte. Tout le projet passe par ici : le placement, l'aperçu SVG et
 * l'export PDF utilisent les mêmes largeurs, donc aucun des trois ne peut
 * dériver des deux autres.
 *
 * Mesurer au `canvas` du navigateur aurait été plus souple mais donnerait un
 * résultat dépendant des polices installées sur le poste, et le PDF, lui, est
 * écrit avec les métriques Adobe. Les deux auraient divergé.
 */

const BY_FAMILY: Record<FontFamily, FontMetrics> = {
  sans: HELVETICA,
  serif: TIMES,
  mono: COURIER,
}

/** Pile CSS dont le premier nom est métriquement identique à la table utilisée. */
const CSS_STACK: Record<FontFamily, string> = {
  sans: 'Helvetica, Nimbus Sans, Arial, sans-serif',
  serif: 'Times, Nimbus Roman, Times New Roman, serif',
  mono: 'Courier, Nimbus Mono PS, Courier New, monospace',
}

export function metricsFor(family: FontFamily): FontMetrics {
  return BY_FAMILY[family]
}

export function cssFontFamily(family: FontFamily): string {
  return CSS_STACK[family]
}

/** Avance d'un caractère, en pixels, pour un corps donné. */
export function advanceOf(font: FontMetrics, char: string, size: number): number {
  const width = font.widths[char.codePointAt(0) ?? 32] ?? font.fallback
  return (width * size) / 1000
}

/**
 * Hauteur de la bande d'encre pour un corps donné : de la queue du `p` au
 * sommet du `É`. C'est cette bande, et non le corps, qui ne doit rien
 * recouvrir ; les deux diffèrent de presque 20 % en Helvetica.
 */
export function bandHeight(font: FontMetrics, size: number): number {
  return ((font.ascent - font.descent) * size) / 1000
}

/**
 * Décalage de la ligne de base par rapport au tracé, pour que la bande d'encre
 * soit centrée dessus plutôt que posée dessus.
 *
 * Poser la ligne de base sur le tracé décale visuellement tout le texte vers
 * l'extérieur des courbes, et surtout rend le calcul de place libre asymétrique
 * pour rien : centré, un texte de bande `h` tient exactement dans un couloir de
 * largeur `h`.
 */
export function baselineOffset(font: FontMetrics, size: number): number {
  return ((font.ascent + font.descent) * size) / 2000
}

/**
 * Corps maximal dont la bande d'encre tient dans un couloir de largeur donnée.
 * Réciproque exacte de `bandHeight`.
 */
export function sizeForBand(font: FontMetrics, band: number): number {
  return (band * 1000) / (font.ascent - font.descent)
}

/**
 * Découpe un texte en unités indivisibles à poser une par une.
 *
 * Un caractère hors du plan de base (un emoji) tient sur deux unités de code
 * UTF-16 ; les découper séparément produirait deux caractères de remplacement.
 * `Array.from` itère bien par point de code. Les accents précomposés du français
 * sont couverts par la table, les accents combinants ne le sont pas.
 */
export function toChars(text: string): string[] {
  return Array.from(text)
}
