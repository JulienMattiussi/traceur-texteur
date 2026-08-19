import { useRef, useState } from 'react'
import type { Point } from '@/lib/types'

/**
 * Surface de tracé à la souris.
 *
 * Elle ne renvoie que des positions brutes, normalisées entre 0 et 1 : le
 * lissage, la détection de fermeture et la mise à l'échelle sont du ressort de
 * `smooth.ts` et de `page.ts`. Un composant qui se contente de collecter le geste
 * reste testable et n'a pas d'opinion sur la géométrie.
 *
 * Les événements de pointeur, et non de souris : c'est la même interface pour le
 * doigt, le stylet et la souris, et la capture rend le tracé insensible à une
 * sortie de la zone.
 */

interface DrawPadProps {
  /** Rapport largeur sur hauteur de la page, pour dessiner dans le bon cadre. */
  aspect: number
  paths: Point[][]
  onChange: (paths: Point[][]) => void
}

export function DrawPad({ aspect, paths, onChange }: DrawPadProps) {
  const surface = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Point[] | null>(null)

  const positionOf = (event: React.PointerEvent): Point | null => {
    const box = surface.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    }
  }

  const start = (event: React.PointerEvent): void => {
    const point = positionOf(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setCurrent([point])
  }

  const extend = (event: React.PointerEvent): void => {
    if (!current) return
    const point = positionOf(event)
    if (!point) return
    setCurrent([...current, point])
  }

  const finish = (): void => {
    // Sous trois points il n'y a pas de trait, seulement un clic.
    if (current && current.length >= 3) onChange([...paths, current])
    setCurrent(null)
  }

  const shown = current ? [...paths, current] : paths

  return (
    <div className="space-y-2">
      <div
        ref={surface}
        onPointerDown={start}
        onPointerMove={extend}
        onPointerUp={finish}
        onPointerCancel={finish}
        role="application"
        aria-label="Zone de tracé à la souris"
        className="w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        style={{ aspectRatio: aspect }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {shown.map((path, index) => (
            <polyline
              key={index}
              points={path.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
              fill="none"
              stroke="#0ea5e9"
              // Le tracé est étiré par `preserveAspectRatio`, donc une épaisseur
              // constante s'y déformerait aussi : le vecteur non mis à l'échelle
              // la garde ronde.
              vectorEffect="non-scaling-stroke"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-snug text-slate-500">
          {paths.length === 0
            ? 'Trace une ou plusieurs lignes. Reviens près du départ pour fermer la boucle.'
            : `${paths.length} tracé${paths.length > 1 ? 's' : ''}.`}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onChange(paths.slice(0, -1))}
            disabled={paths.length === 0}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={paths.length === 0}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            Tout effacer
          </button>
        </div>
      </div>
    </div>
  )
}
