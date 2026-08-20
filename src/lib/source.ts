import { fitStrokes, toPixels, type Canvas } from '@/lib/page'
import type { Settings, SourceKind } from '@/lib/settings'
import { buildShape } from '@/lib/shapes'
import { freehandStroke } from '@/lib/smooth'
import { orderStrokes, traceImage } from '@/lib/trace'
import type { Point, Stroke } from '@/lib/types'

/**
 * Les trois sources deviennent un seul jeu de tracés, cadrés dans la page.
 *
 * C'est le seul endroit qui sait qu'il existe trois sources ; tout ce qui suit dans
 * le pipeline est indifférent à leur provenance. Ici plutôt que dans le composant
 * parce que rien là-dedans ne touche à React, et que ça se testait donc mal : le
 * harnais de mesure en tenait une copie ligne pour ligne, et un harnais qui mesure
 * autre chose que ce que l'application produit est inutile.
 */

/**
 * Ce que le moteur a besoin de savoir d'un dessin décodé. Volontairement plus
 * étroit que le `LoadedImage` de `src/platform` : `src/lib` ne doit pas dépendre du
 * navigateur, et cette forme structurelle suffit.
 */
interface GrayImage {
  gray: Uint8Array
  width: number
  height: number
}

export interface SourceInput {
  /** Le dessin déposé, s'il y en a un. */
  image?: GrayImage | null
  /** Les gestes à la souris, en coordonnées normalisées entre 0 et 1. */
  paths?: Point[][]
}

/**
 * Passes de lissage d'un geste à la souris. Six suffisent en pratique : au-delà, un
 * tracé volontairement anguleux commence à perdre sa forme sans gagner en douceur.
 */
const FREEHAND_PASSES = 6

/**
 * Distance, en millimètres imprimés, sous laquelle un geste revenu près de son
 * départ est refermé. Assez large pour pardonner la main, assez étroite pour qu'un
 * trait qui s'arrête franchement reste ouvert.
 */
const CLOSE_WITHIN_MM = 6

export function strokesFor(
  source: SourceKind,
  settings: Settings,
  canvas: Canvas,
  input: SourceInput = {},
): Stroke[] {
  if (source === 'forme') {
    return [
      buildShape(settings.shape, canvas.inset, {
        corner: toPixels(settings.cornerMm),
        turns: settings.turns,
        teeth: settings.teeth,
      }),
    ]
  }

  if (source === 'dessin') {
    const { image } = input
    if (!image) return []

    const traced = traceImage(image.gray, image.width, image.height, {
      mode: settings.traceMode,
      threshold: settings.threshold,
      minBlobArea: settings.minBlobArea,
      pruneSpursBelow: settings.pruneSpursBelow,
      // La longueur minimale est un réglage de page, exprimé en millimètres
      // imprimés : elle doit donc être comparée après cadrage, et non dans les
      // pixels de l'image d'origine, dont l'échelle est arbitraire.
      minLength: 0,
    })
    return orderStrokes(fitStrokes(traced, canvas), toPixels(settings.minLengthMm))
  }

  // À la souris. Les coordonnées arrivent normalisées, parce que la surface de
  // tracé ne connaît que sa propre taille à l'écran.
  const strokes: Stroke[] = []
  for (const path of input.paths ?? []) {
    const scaled = path.map((point) => ({
      x: canvas.inset.x + point.x * canvas.inset.width,
      y: canvas.inset.y + point.y * canvas.inset.height,
    }))
    const stroke = freehandStroke(scaled, {
      passes: FREEHAND_PASSES,
      closeWithin: toPixels(CLOSE_WITHIN_MM),
    })
    if (stroke) strokes.push(stroke)
  }

  return strokes
}
