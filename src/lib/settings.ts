import type { ShapeKind } from '@/lib/shapes'
import type { TraceMode } from '@/lib/trace'
import type { FontFamily } from '@/lib/types'

/** D'où vient le tracé. */
export type SourceKind = 'forme' | 'dessin' | 'souris'

/**
 * Réglages exposés à l'interface. Volontairement un sous-ensemble des options du
 * moteur : `bendRatio`, la pente de lissage ou la porte du champ de distance sont
 * des constantes de qualité, pas des choix d'utilisateur.
 */
export interface Settings {
  text: string
  family: FontFamily
  colour: string
  formatKey: string

  /** Répéter le texte jusqu'à remplir, ou ne l'écrire qu'une fois. */
  repeat: boolean
  /** Ce qui sépare deux répétitions. Une espace insécable évite un blanc double. */
  separator: string
  /** Interlettrage additionnel, en part de l'avance. */
  tracking: number

  /** Bornes du corps de police, en millimètres imprimés. */
  maxSizeMm: number
  minSizeMm: number
  /** Part du couloir disponible que le texte occupe. Sous 1, il reste de l'air. */
  fillRatio: number
  /**
   * Élargir les virages trop serrés pour porter le corps minimal, plutôt que d'y
   * rétrécir le texte ou de les enjamber. Le tracé s'écarte alors un peu du dessin
   * dans les angles, et `stats.roundedMm` dit de combien.
   */
  roundCorners: boolean

  /** Réglages de forme. */
  shape: ShapeKind
  turns: number
  teeth: number
  cornerMm: number

  /** Réglages de dessin. */
  traceMode: TraceMode
  threshold: number | 'auto'
  minBlobArea: number
  pruneSpursBelow: number
  /** Longueur sous laquelle un tracé est ignoré, en millimètres imprimés. */
  minLengthMm: number
}

export const DEFAULT_SETTINGS: Settings = {
  text: 'Il faut trouver ce qui se cache dans ce message dont la disposition ne facilite pas sa lecture',
  family: 'serif',
  colour: '#0f766e',
  formatKey: 'a4-portrait',

  repeat: true,
  separator: ' ',
  tracking: 0,

  maxSizeMm: 7,
  // 2,5 mm plutôt que 1,2 : en dessous, le texte est mesurable mais pas lisible, et
  // le laisser descendre si bas était le vrai défaut. Les virages serrés sont
  // maintenant élargis, donc ce plancher ne coûte presque plus de couverture.
  minSizeMm: 2.5,
  fillRatio: 0.85,
  roundCorners: true,

  shape: 'spirale',
  turns: 7,
  teeth: 6,
  cornerMm: 8,

  traceMode: 'contour',
  threshold: 'auto',
  minBlobArea: 24,
  pruneSpursBelow: 6,
  minLengthMm: 12,
}
