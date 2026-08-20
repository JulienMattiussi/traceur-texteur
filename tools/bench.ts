/**
 * Harnais de mesure. Tourne sous Node, sans navigateur : c'est possible parce que
 * `src/lib` ne touche jamais au DOM et que les métriques de police sont une table
 * et non une mesure du canvas.
 *
 * Écrit dans `out/` un SVG par cas, et affiche le tableau de mesures. Le chiffre
 * qui compte est `chevauchements`, qui doit rester à zéro.
 *
 *   make bench
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { canvasFor, formatByKey } from '@/lib/page'
import { renderPdf } from '@/lib/pdf'
import { compose } from '@/lib/pipeline'
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings'
import { SHAPES, type ShapeKind } from '@/lib/shapes'
import { strokesFor } from '@/lib/source'
import { renderSvg } from '@/lib/svg'
import { star } from './drawing.ts'

interface Case {
  name: string
  settings: Partial<Settings>
  /** Source « dessin » : une image synthétique au lieu d'une forme. */
  drawing?: boolean
}

const CASES: Case[] = [
  ...SHAPES.map((shape) => ({ name: shape.kind, settings: { shape: shape.kind as ShapeKind } })),
  { name: 'spirale-20-tours', settings: { shape: 'spirale' as ShapeKind, turns: 20 } },
  { name: 'spirale-3-tours', settings: { shape: 'spirale' as ShapeKind, turns: 3 } },
  { name: 'spirale-une-fois', settings: { shape: 'spirale' as ShapeKind, repeat: false } },
  {
    name: 'cercle-taille-fixe',
    settings: { shape: 'cercle' as ShapeKind, maxSizeMm: 4, minSizeMm: 4 },
  },
  { name: 'spirale-mono', settings: { shape: 'spirale' as ShapeKind, family: 'mono' as const } },
  { name: 'dessin-contour', settings: { traceMode: 'contour' as const }, drawing: true },
  { name: 'dessin-squelette', settings: { traceMode: 'squelette' as const }, drawing: true },
]

/** L'étoile de référence du mode dessin, calculée une fois. */
const DRAWING = star(600)

mkdirSync('out', { recursive: true })

const rows: string[][] = [
  ['cas', 'tracés', 'glyphes', 'répét.', 'couvert.', 'corps mm', 'saut mm', 'chevauch.', 'ms'],
]

for (const testCase of CASES) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...testCase.settings }
  const canvas = canvasFor(formatByKey(settings.formatKey))

  // La même fonction que l'interface. Le harnais en tenait une copie ligne pour
  // ligne : mesurer autre chose que ce que l'application produit est le seul défaut
  // qu'un harnais ne peut pas détecter lui-même.
  const strokes = strokesFor(testCase.drawing ? 'dessin' : 'forme', settings, canvas, {
    image: DRAWING,
  })

  // Une passe à blanc avant de chronométrer : sans elle on mesure surtout la
  // compilation du moteur par le moteur JavaScript, ce qui gonflait les premiers
  // cas d'un facteur dix et rendait le tableau incomparable d'une ligne à l'autre.
  compose(strokes, canvas, settings)

  const started = performance.now()
  const composition = compose(strokes, canvas, settings)
  const elapsed = performance.now() - started

  writeFileSync(`out/${testCase.name}.svg`, renderSvg(composition, {}))
  writeFileSync(
    `out/${testCase.name}-trace.svg`,
    renderSvg(composition, { showStroke: true, strokeOnly: true }),
  )
  writeFileSync(
    `out/${testCase.name}.pdf`,
    renderPdf(composition, formatByKey(settings.formatKey), { title: testCase.name }),
  )

  const { stats } = composition
  rows.push([
    testCase.name,
    String(stats.strokes),
    String(stats.glyphs),
    stats.repetitions.toFixed(1),
    `${Math.round(stats.coverage * 100)} %`,
    `${stats.minSizeMm.toFixed(1)} a ${stats.maxSizeMm.toFixed(1)}`,
    stats.skippedMm.toFixed(0),
    String(stats.overlaps),
    elapsed.toFixed(0),
  ])
}

const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)))
for (const row of rows) {
  console.log(row.map((cell, column) => cell.padEnd(widths[column]!)).join('  '))
}
