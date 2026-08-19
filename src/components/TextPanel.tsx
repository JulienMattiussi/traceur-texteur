import { Segmented } from '@/components/Field'
import type { Settings } from '@/lib/settings'
import type { FontFamily } from '@/lib/types'

/**
 * Le texte et son habillage.
 *
 * Trois familles seulement, et c'est un choix assumé : ce sont celles des quatorze
 * polices de base du PDF, donc les seules dont on connaisse les largeurs exactes
 * sans embarquer de fichier. Une police libre de plus rendrait l'export PDF
 * approximatif, ou obligerait à convertir chaque lettre en courbes.
 */

interface TextPanelProps {
  settings: Settings
  onChange: (settings: Settings) => void
}

const FAMILIES: { value: FontFamily; label: string }[] = [
  { value: 'serif', label: 'Times' },
  { value: 'sans', label: 'Helvetica' },
  { value: 'mono', label: 'Courier' },
]

export function TextPanel({ settings, onChange }: TextPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    onChange({ ...settings, [key]: value })

  return (
    <div className="space-y-3.5">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-800">Message</span>
        <textarea
          value={settings.text}
          onChange={(event) => update('text', event.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-slate-300 p-2 text-sm text-slate-900 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none"
        />
      </label>

      <Segmented
        label="Police"
        value={settings.family}
        options={FAMILIES}
        onChange={(family) => update('family', family)}
      />

      <Segmented
        label="Remplissage"
        value={settings.repeat ? 'repeter' : 'une-fois'}
        options={[
          { value: 'repeter', label: 'Répéter' },
          { value: 'une-fois', label: 'Une seule fois' },
        ]}
        onChange={(mode) => update('repeat', mode === 'repeter')}
      />
      <p className="text-xs leading-snug text-slate-500">
        {settings.repeat
          ? 'Le message tourne en boucle jusqu’au bout du tracé.'
          : 'Le message est écrit une fois, réduit juste assez pour tomber sur la fin du tracé.'}
      </p>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">Couleur</span>
        <input
          type="color"
          value={settings.colour}
          onChange={(event) => update('colour', event.target.value)}
          aria-label="Couleur du texte"
          className="h-8 w-14 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
      </label>
    </div>
  )
}
