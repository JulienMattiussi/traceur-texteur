import { measureClearances } from '@/lib/clearance'
import { fitOnce } from '@/lib/fit'
import { flowText } from '@/lib/flow'
import { curvatures, resample, sampledLength, tangentAngles } from '@/lib/geometry'
import { bandHeight, metricsFor } from '@/lib/metrics'
import { toMillimetres, toPixels, type Canvas } from '@/lib/page'
import { countOverlaps } from '@/lib/quality'
import { relaxCurvature } from '@/lib/relax'
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
 * Pas d'échantillonnage : un demi-millimètre imprimé.
 *
 * Plus fin ne mesure rien de plus : la tangente et la courbure sont de toute
 * façon lissées sur une fenêtre de plusieurs millimètres. En revanche le coût de
 * la place libre est quadratique en densité d'échantillons, et passer de 0,25 à
 * 0,5 mm a divisé le temps de calcul d'une spirale de vingt tours par quatre.
 */
const STEP = toPixels(0.5)

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

/** Fenêtre de mesure, en échantillons, pour une longueur donnée en millimètres. */
function windowFor(millimetres: number, step: number): number {
  return Math.max(1, Math.round(toPixels(millimetres) / step))
}

interface BuiltRibbon {
  ribbon: Ribbon
  /** Écart maximal, en pixels, entre le tracé suivi et le tracé d'origine. */
  moved: number
}

/**
 * Nombre maximal de passes de relâchement. Un tracé en dents de scie de grande
 * amplitude ne peut pas être ouvert sans être détruit : au bout de ces passes on
 * s'arrête, et le plafond de courbure reprend la main sur ce qui reste.
 */
const RELAX_PASSES = 60

/**
 * Budget de relâchement, en échantillons traités toutes passes confondues.
 *
 * Chaque passe coûte le tracé entier alors que le défaut, lui, est local : sur une
 * spirale de vingt-cinq tours, vingt-sept échantillons sur dix-neuf mille
 * dépassaient la cible, et les ouvrir coûtait 377 ms pour ne récupérer que 25 mm de
 * texte. Borner le total de passes par la longueur du tracé rend le coût à peu près
 * constant quelle que soit la taille du dessin, ce dont un curseur a besoin. Les
 * grands tracés sont donc moins raffinés que les petits, et c'est le bon compromis :
 * ce sont eux dont la place libre décide de toute façon.
 */
const RELAX_BUDGET = 100_000

function buildRibbon(stroke: Stroke, maxCurvature: number): BuiltRibbon | null {
  const first = resample(stroke.points, stroke.closed, STEP)
  if (first.points.length < 3) return null

  // `relaxCurvature` rend un tracé déjà rééchantillonné : ouvrir un virage
  // raccourcit le tracé, donc son pas n'est plus tout à fait celui d'avant, et
  // c'est le sien qu'il faut retenir pour la suite. Sans plafond de courbure, il
  // rend le tracé tel quel.
  const { points, step, moved } = relaxCurvature(first.points, stroke.closed, first.step, {
    maxCurvature,
    window: windowFor(CURVATURE_SMOOTHING_MM, first.step),
    maxPasses: Math.max(4, Math.min(RELAX_PASSES, Math.round(RELAX_BUDGET / first.points.length))),
  })

  // Les fenêtres de lissage sont exprimées en millimètres imprimés, donc en
  // longueur réelle : le résultat ne dépend pas du pas d'échantillonnage.
  const angles = tangentAngles(points, windowFor(TANGENT_SMOOTHING_MM, step), stroke.closed)

  return {
    moved,
    ribbon: {
      points,
      angles,
      curvatures: curvatures(
        points,
        angles,
        windowFor(CURVATURE_SMOOTHING_MM, step),
        stroke.closed,
      ),
      // Rempli juste après : la place libre ne se mesure qu'une fois tous les
      // tracés connus, puisqu'ils se gênent mutuellement.
      clearances: [],
      step,
      length: sampledLength(points.length, step, stroke.closed),
      closed: stroke.closed,
    },
  }
}

export function compose(strokes: Stroke[], canvas: Canvas, settings: Settings): Composition {
  const timings: Record<string, number> = {}
  const font = metricsFor(settings.family)

  const maxSize = toPixels(settings.maxSizeMm)
  const minSize = toPixels(settings.minSizeMm)

  // Le critère de relâchement découle du corps minimal, il n'est pas réglé à part :
  // on ouvre les virages juste assez pour que la courbure ne dicte jamais un corps
  // inférieur à celui sous lequel on refuse d'écrire.
  const maxCurvature = settings.widenBends ? 1 / (BEND_RATIO * bandHeight(font, minSize)) : 0

  let mark = performance.now()
  const built = strokes
    .map((stroke) => buildRibbon(stroke, maxCurvature))
    .filter((entry): entry is BuiltRibbon => entry !== null)
  const ribbons = built.map((entry) => entry.ribbon)
  timings.echantillonnage = performance.now() - mark

  // Plafond de recherche : le corps maximal demandé ne peut de toute façon pas
  // grandir au-delà, donc connaître la distance exacte plus loin ne servirait
  // qu'à ralentir la recherche.
  const cap = bandHeight(font, maxSize) / Math.max(settings.fillRatio, 0.05)

  mark = performance.now()
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
  timings.placeLibre = performance.now() - mark

  mark = performance.now()
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
  timings.tailles = performance.now() - mark

  mark = performance.now()
  const flowOptions = {
    font,
    text: settings.text,
    separator: settings.separator,
    tracking: settings.tracking,
  }
  const flow = settings.repeat
    ? flowText(ribbons, fields, { ...flowOptions, repeat: true, scale: 1 })
    : fitOnce(ribbons, fields, flowOptions)
  timings.pose = performance.now() - mark

  mark = performance.now()
  const overlaps = countOverlaps(flow.glyphs, font)
  timings.controle = performance.now() - mark

  return {
    width: canvas.width,
    height: canvas.height,
    glyphs: flow.glyphs,
    // Les tracés réellement suivis, et non ceux reçus : quand les virages ont été
    // relâchés, montrer le dessin d'origine ferait passer le texte pour mal posé
    // alors qu'il suit exactement sa courbe.
    strokes: ribbons.map((ribbon) => ({ points: ribbon.points, closed: ribbon.closed })),
    family: settings.family,
    colour: settings.colour,
    stats: {
      strokes: ribbons.length,
      strokeLength: ribbons.reduce((total, ribbon) => total + ribbon.length, 0),
      roundedMm: toMillimetres(built.reduce((worst, entry) => Math.max(worst, entry.moved), 0)),
      glyphs: flow.glyphs.length,
      repetitions: flow.repetitions,
      coverage: flow.available > 0 ? Math.max(0, flow.consumed - flow.skipped) / flow.available : 0,
      skippedMm: toMillimetres(flow.skipped),
      minSizeMm: toMillimetres(flow.minSize),
      maxSizeMm: toMillimetres(flow.maxSize),
      cramped: fields.reduce((total, field) => total + field.cramped, 0),
      overlaps,
      timings,
    },
  }
}
