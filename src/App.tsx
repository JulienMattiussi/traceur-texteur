import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { Controls } from '@/components/Controls'
import { Logo, TitleLink } from '@/components/Logo'
import { Preview } from '@/components/Preview'
import { SourcePanel } from '@/components/SourcePanel'
import { StatsPanel } from '@/components/StatsPanel'
import { TextPanel } from '@/components/TextPanel'
import { Toolbar } from '@/components/Toolbar'
import { canvasFor, fitStrokes, formatByKey, toPixels } from '@/lib/page'
import { renderPdf } from '@/lib/pdf'
import { compose } from '@/lib/pipeline'
import { DEFAULT_SETTINGS, type Settings, type SourceKind } from '@/lib/settings'
import { buildShape } from '@/lib/shapes'
import { freehandStroke } from '@/lib/smooth'
import { renderSvg } from '@/lib/svg'
import { orderStrokes, traceImage } from '@/lib/trace'
import type { Point, Stroke } from '@/lib/types'
import { download, loadGrayImage, type LoadedImage } from '@/platform/image'
import { rasterize } from '@/platform/raster'

/**
 * Le titre est rattaché à la section par `aria-labelledby`, sans quoi celle-ci
 * n'a pas de nom accessible et n'est pas annoncée comme un repère : un lecteur
 * d'écran ne peut alors pas sauter de « Le texte » à « Mesures ».
 */
function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
    >
      <h2 id={id} className="mb-3 text-sm font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function App() {
  const [source, setSource] = useState<SourceKind>('forme')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [paths, setPaths] = useState<Point[][]>([])
  const [showStroke, setShowStroke] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const format = useMemo(() => formatByKey(settings.formatKey), [settings.formatKey])
  const canvas = useMemo(() => canvasFor(format), [format])

  const handleFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const loaded = await loadGrayImage(file)
      // L'URL d'objet de l'image remplacée doit être révoquée, sinon son blob
      // reste en mémoire pour toute la durée de la page.
      setImage((previous) => {
        if (previous) URL.revokeObjectURL(previous.sourceUrl)
        return loaded
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image illisible.')
      setImage(null)
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * Les tracés, quelle que soit leur origine, dans le repère de la page.
   *
   * Mémoïsé à part de la composition : extraire les traits d'un dessin est de
   * loin l'étape la plus lourde, et bouger le curseur de corps maximal ne doit
   * pas la rejouer.
   */
  const strokes = useMemo<Stroke[]>(() => {
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
      if (!image) return []
      const traced = traceImage(image.gray, image.width, image.height, {
        mode: settings.traceMode,
        threshold: settings.threshold,
        minBlobArea: settings.minBlobArea,
        pruneSpursBelow: settings.pruneSpursBelow,
        // La longueur minimale est un réglage de page, exprimé en millimètres
        // imprimés ; elle doit donc être comparée après cadrage, pas dans les
        // pixels de l'image d'origine, dont l'échelle est arbitraire.
        minLength: 0,
      })
      return orderStrokes(fitStrokes(traced, canvas), toPixels(settings.minLengthMm))
    }

    const scaled = paths.map((path) => ({
      points: path.map((point) => ({
        x: canvas.inset.x + point.x * canvas.inset.width,
        y: canvas.inset.y + point.y * canvas.inset.height,
      })),
      closed: false,
    }))

    return scaled
      .map((stroke) =>
        freehandStroke(stroke.points, { passes: 6, closeWithin: toPixels(6) }),
      )
      .filter((stroke): stroke is Stroke => stroke !== null)
  }, [source, settings, canvas, image, paths])

  const composition = useMemo(
    () => (strokes.length > 0 ? compose(strokes, canvas, settings) : null),
    [strokes, canvas, settings],
  )

  const baseName = image && source === 'dessin' ? image.name.replace(/\.[^.]+$/, '') : 'texteur'

  const exportSvg = (): void => {
    if (!composition) return
    download(`${baseName}.svg`, renderSvg(composition), 'image/svg+xml')
  }

  const exportPdf = (): void => {
    if (!composition) return
    download(`${baseName}.pdf`, renderPdf(composition, format, { title: baseName }), 'application/pdf')
  }

  const exportPng = async (): Promise<void> => {
    if (!composition) return
    setBusy(true)
    setError(null)
    try {
      const blob = await rasterize(renderSvg(composition))
      download(`${baseName}.png`, blob, 'image/png')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export PNG impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen print:min-h-0">
      <div className="mx-auto max-w-6xl px-6 py-8 print:p-0">
        <header className="flex items-center gap-3.5 print:hidden">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <Logo className="h-9 w-9 text-slate-900" />
          </span>
          <div>
            {/*
              Le trait d'union est remplacé par l'arc qui porte le texte. Le nom
              accessible reste entier grâce à `aria-label`.
            */}
            <h1
              aria-label="Traceur-texteur"
              className="flex items-center gap-1.5 text-2xl font-bold tracking-tight text-slate-900"
            >
              <span>Traceur</span>
              <TitleLink />
              <span>texteur</span>
            </h1>
            <p className="text-sm text-slate-600">
              Écrit un message le long d&apos;un tracé, en adaptant sa taille à la place libre.
            </p>
          </div>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-[21rem_1fr] print:mt-0 print:gap-0">
          <aside className="space-y-4 print:hidden">
            <Card title="Le tracé">
              <SourcePanel
                source={source}
                onSource={setSource}
                settings={settings}
                onSettings={setSettings}
                imageName={image?.name ?? null}
                onFile={handleFile}
                busy={busy}
                aspect={canvas.inset.width / canvas.inset.height}
                paths={paths}
                onPaths={setPaths}
              />
            </Card>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200"
              >
                {error}
              </p>
            ) : null}

            <Card title="Le texte">
              <TextPanel settings={settings} onChange={setSettings} />
            </Card>

            <Card title="Mise en page">
              <Controls settings={settings} onChange={setSettings} />
            </Card>

            {composition ? (
              <Card title="Mesures">
                <StatsPanel composition={composition} />
              </Card>
            ) : null}
          </aside>

          <main>
            {composition ? (
              <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 print:rounded-none print:shadow-none print:ring-0">
                <div className="border-b border-slate-200/70 bg-slate-50/70 px-4 py-3 print:hidden">
                  <Toolbar
                    showStroke={showStroke}
                    onShowStroke={setShowStroke}
                    onExportPng={() => void exportPng()}
                    onExportSvg={exportSvg}
                    onExportPdf={exportPdf}
                    onPrint={() => window.print()}
                    busy={busy}
                  />
                </div>

                <div className="p-4 print:p-0">
                  <Preview composition={composition} showStroke={showStroke} />
                </div>
              </div>
            ) : (
              <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 text-center">
                <Logo className="h-14 w-14 text-slate-300" />
                <p className="max-w-xs text-sm text-slate-500">
                  {busy
                    ? 'Analyse en cours...'
                    : source === 'dessin'
                      ? 'Choisis un dessin au trait pour commencer.'
                      : 'Trace une ligne pour commencer.'}
                </p>
              </div>
            )}
          </main>
        </div>

        <footer className="mt-10 text-center text-sm text-slate-500 print:hidden">
          <a
            href="https://github.com/JulienMattiussi/traceur-texteur"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:text-slate-900"
          >
            Fait avec <span className="text-rose-500">&#10084;&#65039;</span> par{' '}
            <span className="font-medium underline decoration-sky-400 decoration-2 underline-offset-4">
              YavaDeus
            </span>
          </a>
        </footer>
      </div>
    </div>
  )
}
