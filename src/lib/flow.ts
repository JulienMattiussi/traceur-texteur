import type { FontMetrics } from '@/lib/fonts'
import { angleAt, pointAt, sampleAt, wrapIndex } from '@/lib/geometry'
import { advanceOf, bandHeight, baselineOffset, toChars } from '@/lib/metrics'
import type { SizeField } from '@/lib/sizing'
import type { Glyph, Ribbon } from '@/lib/types'

/**
 * Pose les caractères le long des tracés, un par un.
 *
 * Le texte n'est jamais confié à `textPath` du SVG : outre qu'il ne saurait pas
 * faire varier le corps en cours de route, il fait tourner chaque glyphe autour
 * de sa ligne de base, ce qui les empile sur le bord intérieur des virages. Ici,
 * chaque caractère est placé et tourné explicitement, et l'avance le long du
 * tracé est corrigée de la courbure pour que ce bord intérieur reste dégagé.
 */

export interface FlowOptions {
  font: FontMetrics
  text: string
  /** Répéter le texte jusqu'à remplir le tracé, ou ne l'écrire qu'une fois. */
  repeat: boolean
  /** Ce qui sépare deux répétitions. */
  separator: string
  /** Interlettrage additionnel, en part de l'avance. */
  tracking: number
  /**
   * Réduction appliquée au champ de tailles, entre 0 et 1. Elle sert à faire
   * tenir un texte donné sur une longueur donnée ; au-delà de 1 elle est
   * ignorée, car le champ est déjà le plus grand corps qui ne chevauche rien.
   */
  scale: number
}

export interface FlowResult {
  glyphs: Glyph[]
  /** Longueur de tracé parcourue, et longueur offerte. */
  consumed: number
  available: number
  /** Longueur enjambée faute de place, comprise dans `consumed`. */
  skipped: number
  /** Nombre de fois que le texte a été écrit en entier. */
  repetitions: number
  /** Vrai si, en mode « une seule fois », le texte n'a pas tenu. */
  truncated: boolean
  minSize: number
  maxSize: number
}

/**
 * Combien de longueur de tracé consommer pour un caractère.
 *
 * À plat, c'est son avance. Dans un virage de courbure `k`, les deux bords de la
 * bande ne parcourent pas le même arc : celui du côté intérieur en parcourt
 * moins. Comme le caractère est un bloc rigide posé tangentiellement, avancer de
 * sa seule avance laisserait le suivant empiéter sur lui du côté intérieur. Le
 * facteur de correction est exactement le rapport des rayons.
 */
function arcAdvance(advance: number, curvature: number, band: number): number {
  return advance * (1 + (Math.abs(curvature) * band) / 2)
}

/**
 * Un caractère occupe une portion de tracé, pas un point : il suffit qu'une
 * partie de cette portion soit trop étroite pour qu'il ne faille pas l'écrire.
 */
function spanBlocked(ribbon: Ribbon, blocked: boolean[], from: number, to: number): boolean {
  const first = Math.floor(from / ribbon.step)
  const last = Math.ceil(to / ribbon.step)

  for (let i = first; i <= last; i++) {
    if (blocked[wrapIndex(i, 0, blocked.length, ribbon.closed)]) return true
  }
  return false
}

export function flowText(ribbons: Ribbon[], fields: SizeField[], options: FlowOptions): FlowResult {
  const { font, text, repeat, separator, tracking } = options
  // Borné ici plutôt que chez l'appelant : c'est l'invariant du projet, aucun
  // appelant ne doit pouvoir écrire plus gros que la place libre.
  const scale = Math.min(1, options.scale)

  const unit = toChars(text)
  const cycle = repeat ? toChars(text + separator) : unit
  const total = repeat ? Infinity : unit.length

  const glyphs: Glyph[] = []
  let index = 0
  let consumed = 0
  let available = 0
  let skipped = 0
  let minSize = Infinity
  let maxSize = 0

  // Un texte vide, ou fait uniquement d'espaces, ne pose rien.
  //
  // Le vérifier sur le cycle **et sur son encre** est indispensable : en mode
  // répétition, un texte vide devient un cycle d'un seul caractère, le
  // séparateur, et la boucle qui saute les espaces de début tourne alors sans fin
  // puisqu'il n'y a pas de fin à un texte répété. C'est exactement ce qui est
  // arrivé, et rien ne l'arrêtait.
  if (!cycle.some((char) => char !== ' ')) {
    return {
      glyphs,
      consumed: 0,
      available: ribbons.reduce((sum, ribbon) => sum + ribbon.length, 0),
      skipped: 0,
      repetitions: 0,
      truncated: false,
      minSize: 0,
      maxSize: 0,
    }
  }

  for (let r = 0; r < ribbons.length; r++) {
    const ribbon = ribbons[r]!
    const { sizes, blocked } = fields[r]!
    available += ribbon.length

    let s = 0
    // Un tracé ne commence jamais par une espace : elle laisserait un blanc au
    // départ sans qu'on comprenne pourquoi.
    while (index < total && cycle[index % cycle.length] === ' ') index++

    while (index < total) {
      const char = cycle[index % cycle.length]!

      // La taille est lue au milieu du caractère, pas à son bord : sur un champ
      // qui varie, la lire au bord décale tout le texte d'une demi-lettre.
      const rough = sampleAt(sizes, s, ribbon.step, ribbon.closed) * scale
      const roughAdvance = advanceOf(font, char, rough) * (1 + tracking)
      const size = sampleAt(sizes, s + roughAdvance / 2, ribbon.step, ribbon.closed) * scale

      const advance = advanceOf(font, char, size) * (1 + tracking)
      const curvature = sampleAt(ribbon.curvatures, s + advance / 2, ribbon.step, ribbon.closed)
      const along = arcAdvance(advance, curvature, bandHeight(font, size))

      if (s + along > ribbon.length) break

      // Trop étroit ici : on enjambe, sans consommer de caractère, plutôt que
      // d'empiler des lettres. Le mot est coupé, c'est le prix, et la longueur
      // sautée est comptée pour que l'interface puisse le dire.
      if (spanBlocked(ribbon, blocked, s, s + along)) {
        s += ribbon.step
        skipped += ribbon.step
        continue
      }

      const centre = s + along / 2
      if (char !== ' ') {
        const point = pointAt(ribbon.points, centre, ribbon.step, ribbon.closed)
        const angle = angleAt(ribbon.angles, centre, ribbon.step, ribbon.closed)

        // La bande d'encre est centrée sur le tracé : la ligne de base se pose
        // donc légèrement à côté, le long de la normale.
        const offset = baselineOffset(font, size)
        glyphs.push({
          char,
          x: point.x - Math.sin(angle) * offset,
          y: point.y + Math.cos(angle) * offset,
          angle,
          size,
        })

        if (size < minSize) minSize = size
        if (size > maxSize) maxSize = size
      }

      s += along
      index++
    }

    consumed += s
    if (index >= total) break
  }

  return {
    glyphs,
    consumed,
    available,
    skipped,
    repetitions: repeat ? index / cycle.length : index >= unit.length ? 1 : 0,
    truncated: !repeat && index < unit.length,
    minSize: minSize === Infinity ? 0 : minSize,
    maxSize,
  }
}
