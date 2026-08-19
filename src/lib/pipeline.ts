import { measureClearances } from '@/lib/clearance'
import { fitOnce } from '@/lib/fit'
import { flowText } from '@/lib/flow'
import { curvatures, polylineLength, resample, sampledLength, tangentAngles } from '@/lib/geometry'
import { bandHeight, metricsFor } from '@/lib/metrics'
import { PIXELS_PER_MM, toMillimetres, toPixels, type Canvas } from '@/lib/page'
import { countOverlaps } from '@/lib/quality'
import type { Settings } from '@/lib/settings'
import { sizeField } from '@/lib/sizing'
import type { Composition, Ribbon, Stroke } from '@/lib/types'

/**
 * De tracés bruts à une composition prête à rendre.
 *
 * Les tracés arrivent déjà cadrés dans la page, d'où qu'ils viennent : forme,
 * dessin ou souris. Tout ce qui suit est indifférent à leur provenance, ce qui
 * est le principal intérêt d'avoir isolé les trois sources en amont.
 */

/**
 * Pas d'échantillonnage, en pixels, soit un demi-millimètre imprimé.
 *
 * Plus fin ne mesure rien de plus : la tangente et la courbure sont de toute
 * façon lissées sur une fenêtre de plusieurs millimètres. En revanche le coût de
 * la place libre est quadratique en densité d'échantillons, et passer de 0,25 à
 * 0,5 mm a divisé le temps de calcul d'une spirale de vingt tours par quatre.
 */
const STEP = 2

/** Longueur de lissage de la tangente, en millimètres imprimés. */
const TANGENT_SMOOTHING_MM = 1.5

/**
 * La courbure est une dérivée seconde, donc deux fois plus bruitée : elle se
 * mesure sur une fenêtre plus large. Assez large pour ignorer l'escalier des
 * pixels, assez étroite pour voir un coin arrondi de quelques millimètres.
 */
const CURVATURE_SMOOTHING_MM = 3

/**
 * Rapport entre la porte du champ de distance et son plafond.
 *
 * Il doit rester au-dessus de 1, et ce n'est pas un réglage à tâtonner mais une
 * conséquence : sur une courbe douce, deux points distants de `L` le long du
 * tracé sont à peu près distants de `L` dans le plan. Une porte inférieure au
 * plafond ferait donc voir à chaque point son propre voisinage comme un
 * obstacle, et le texte serait minuscule partout. Le facteur 2 laisse de la marge.
 */
const GATE_RATIO = 2

/** Variation maximale du corps par pixel parcouru. */
const SLOPE = 0.08

/** Rayon de virage minimal exigé, en multiples de la hauteur de bande. */
const BEND_RATIO = 2

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function buildRibbon(stroke: Stroke): Ribbon | null {
  const { points, step } = resample(stroke.points, stroke.closed, STEP)
  if (points.length < 3) return null

  // Les fenêtres de lissage sont exprimées en millimètres imprimés, donc en
  // longueur réelle : le résultat ne dépend pas du pas d'échantillonnage.
  const tangentWindow = Math.max(1, Math.round((TANGENT_SMOOTHING_MM * PIXELS_PER_MM) / step))
  const curvatureWindow = Math.max(1, Math.round((CURVATURE_SMOOTHING_MM * PIXELS_PER_MM) / step))

  const angles = tangentAngles(points, tangentWindow, stroke.closed)

  return {
    points,
    angles,
    curvatures: curvatures(angles, step, curvatureWindow, stroke.closed),
    // Rempli juste après : la place libre ne se mesure qu'une fois tous les
    // tracés connus, puisqu'ils se gênent mutuellement.
    clearances: [],
    step,
    length: sampledLength(points.length, step, stroke.closed),
    closed: stroke.closed,
  }
}

export function compose(strokes: Stroke[], canvas: Canvas, settings: Settings): Composition {
  const timings: Record<string, number> = {}
  const font = metricsFor(settings.family)

  let mark = now()
  const ribbons = strokes.map(buildRibbon).filter((ribbon): ribbon is Ribbon => ribbon !== null)
  timings.echantillonnage = now() - mark

  const maxSize = toPixels(settings.maxSizeMm)
  const minSize = toPixels(settings.minSizeMm)

  // Plafond de recherche : le corps maximal demandé ne peut de toute façon pas
  // grandir au-delà, donc connaître la distance exacte plus loin ne servirait
  // qu'à ralentir la recherche.
  const cap = bandHeight(font, maxSize) / Math.max(settings.fillRatio, 0.05)

  mark = now()
  const clearances = measureClearances(ribbons, {
    cap,
    gate: cap * GATE_RATIO,
    // La page entière, pas la zone utile : les tracés sont cadrés dans celle-ci,
    // donc ils la touchent, et la donner comme cadre ferait voir une place libre
    // nulle sur tout le contour d'un rectangle. La marge est justement là pour
    // que le texte puisse déborder du cadrage sans sortir de la feuille.
    bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
  })
  for (let i = 0; i < ribbons.length; i++) ribbons[i]!.clearances = clearances[i]!
  timings.placeLibre = now() - mark

  mark = now()
  const fields = ribbons.map((ribbon) =>
    sizeField(ribbon, {
      font,
      maxSize,
      minSize,
      fillRatio: settings.fillRatio,
      bendRatio: BEND_RATIO,
      slope: SLOPE,
    }),
  )
  timings.tailles = now() - mark

  mark = now()
  const flowOptions = {
    font,
    text: settings.text,
    separator: settings.separator,
    tracking: settings.tracking,
  }
  const flow = settings.repeat
    ? flowText(ribbons, fields, { ...flowOptions, repeat: true, scale: 1 })
    : fitOnce(ribbons, fields, flowOptions)
  timings.pose = now() - mark

  mark = now()
  const overlaps = countOverlaps(flow.glyphs, font)
  timings.controle = now() - mark

  return {
    width: canvas.width,
    height: canvas.height,
    glyphs: flow.glyphs,
    strokes,
    family: settings.family,
    colour: settings.colour,
    stats: {
      strokes: ribbons.length,
      strokeLength: strokes.reduce(
        (total, stroke) => total + polylineLength(stroke.points, stroke.closed),
        0,
      ),
      glyphs: flow.glyphs.length,
      repetitions: flow.repetitions,
      coverage:
        flow.available > 0 ? Math.max(0, flow.consumed - flow.skipped) / flow.available : 0,
      skippedMm: toMillimetres(flow.skipped),
      minSizeMm: toMillimetres(flow.minSize),
      maxSizeMm: toMillimetres(flow.maxSize),
      cramped: fields.reduce((total, field) => total + field.cramped, 0),
      overlaps,
      timings,
    },
  }
}
