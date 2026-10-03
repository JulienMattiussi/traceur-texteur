import { DrawPad } from '@/components/DrawPad'
import { Dropzone } from '@/components/Dropzone'
import { Segmented, Slider } from '@/components/Field'
import { SHAPES, type ShapeKind } from '@/lib/shapes'
import { settingUpdater, type Settings, type SourceKind } from '@/lib/settings'
import type { Point } from '@/lib/types'

/**
 * D'où vient le tracé. Les trois sources sont exclusives et l'onglet le dit :
 * chacune a ses propres réglages, et les empiler tous ensemble donnerait une
 * colonne où l'on ne saurait plus lesquels s'appliquent.
 */

interface SourcePanelProps {
  source: SourceKind
  onSource: (source: SourceKind) => void
  settings: Settings
  onSettings: (settings: Settings) => void

  imageName: string | null
  onFile: (file: File) => void
  loadingImage: boolean

  aspect: number
  paths: Point[][]
  onPaths: (paths: Point[][]) => void
}

const SOURCES: { value: SourceKind; label: string }[] = [
  { value: 'forme', label: 'Forme' },
  { value: 'dessin', label: 'Dessin' },
  { value: 'souris', label: 'À la souris' },
]

export function SourcePanel({
  source,
  onSource,
  settings,
  onSettings,
  imageName,
  onFile,
  loadingImage,
  aspect,
  paths,
  onPaths,
}: SourcePanelProps) {
  const update = settingUpdater(settings, onSettings)
  const shapeOptions = SHAPES.find((entry) => entry.kind === settings.shape)?.options ?? []

  return (
    <div className="space-y-3.5">
      <Segmented ariaLabel="Source du tracé" value={source} options={SOURCES} onChange={onSource} />

      {source === 'forme' ? (
        <div className="space-y-3.5">
          <Segmented
            ariaLabel="Forme"
            value={settings.shape}
            options={SHAPES.map((shape) => ({ value: shape.kind, label: shape.label }))}
            onChange={(shape: ShapeKind) => update('shape', shape)}
          />

          {shapeOptions.includes('turns') ? (
            <Slider
              label="Tours"
              hint="Plus il y a de tours, plus ils sont serrés, donc plus le texte est petit."
              value={settings.turns}
              min={1}
              max={25}
              onChange={(value) => update('turns', value)}
            />
          ) : null}

          {shapeOptions.includes('teeth') ? (
            <Slider
              label="Dents"
              hint="Au-delà d'une dizaine, les pointes deviennent trop étroites pour porter du texte."
              value={settings.teeth}
              min={1}
              max={20}
              onChange={(value) => update('teeth', value)}
            />
          ) : null}

          {shapeOptions.includes('corner') ? (
            <Slider
              label="Arrondi des angles"
              hint="Un angle vif écraserait le texte : sa courbure y est infinie."
              value={settings.cornerMm}
              min={0}
              max={30}
              unit="mm"
              onChange={(value) => update('cornerMm', value)}
            />
          ) : null}
        </div>
      ) : null}

      {source === 'dessin' ? (
        <div className="space-y-3.5">
          <Dropzone onFile={onFile} loading={loadingImage} currentName={imageName} />

          <Segmented
            label="Ce qu'on suit"
            value={settings.traceMode}
            options={[
              { value: 'contour', label: 'Le contour' },
              { value: 'squelette', label: 'Tout le dessin' },
            ]}
            onChange={(mode) => update('traceMode', mode)}
          />
          <p className="text-xs leading-snug text-slate-500">
            {settings.traceMode === 'contour'
              ? 'La silhouette de chaque forme : une longue boucle continue, sur laquelle une phrase se lit.'
              : 'L’intérieur aussi (yeux, museau, moustaches), mais découpé en dizaines de fragments : un nuage de bouts de phrase.'}
          </p>

          <details className="border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-[11px] font-semibold tracking-wider text-slate-500 uppercase hover:text-slate-700">
              Extraction des traits
            </summary>

            <div className="mt-3 space-y-3.5">
              <Slider
                label="Longueur minimale"
                hint="Ignore les tracés trop courts pour porter plus d'une syllabe."
                value={settings.minLengthMm}
                min={0}
                max={80}
                unit="mm"
                onChange={(value) => update('minLengthMm', value)}
              />
              <Slider
                label="Taille minimale des taches"
                hint="Ignore les salissures et les filigranes."
                value={settings.minBlobArea}
                min={0}
                max={300}
                step={4}
                unit="px"
                onChange={(value) => update('minBlobArea', value)}
              />
              {settings.traceMode === 'squelette' ? (
                <Slider
                  label="Ébarbage"
                  hint="Supprime les barbules des contours irréguliers."
                  value={settings.pruneSpursBelow}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(value) => update('pruneSpursBelow', value)}
                />
              ) : null}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.threshold === 'auto'}
                  onChange={(event) => update('threshold', event.target.checked ? 'auto' : 128)}
                  className="accent-sky-500"
                />
                <span className="text-sm font-medium text-slate-800">Seuil automatique</span>
              </label>
              {settings.threshold === 'auto' ? (
                <span className="block text-xs text-slate-500">
                  Calculé par la méthode d&apos;Otsu, fiable sur un dessin au trait.
                </span>
              ) : (
                <Slider
                  label="Seuil"
                  hint="Sous cette luminosité, un pixel est de l'encre."
                  value={settings.threshold}
                  min={1}
                  max={254}
                  onChange={(value) => update('threshold', value)}
                />
              )}
            </div>
          </details>
        </div>
      ) : null}

      {source === 'souris' ? <DrawPad aspect={aspect} paths={paths} onChange={onPaths} /> : null}
    </div>
  )
}
