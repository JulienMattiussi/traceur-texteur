import { Segmented, Slider } from '@/components/Field'
import { FORMATS } from '@/lib/page'
import type { Settings } from '@/lib/settings'

/**
 * Les réglages de mise en page.
 *
 * Le corps maximal est une **borne**, pas une taille : le moteur écrit toujours
 * le plus gros qu'il peut sans rien chevaucher, et ce curseur dit seulement où
 * s'arrêter quand la place ne manque pas. C'est pour ça qu'il ne s'appelle pas
 * « taille du texte », qui ferait attendre une taille uniforme.
 */

interface ControlsProps {
  settings: Settings
  onChange: (settings: Settings) => void
}

export function Controls({ settings, onChange }: ControlsProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    onChange({ ...settings, [key]: value })

  return (
    <div className="space-y-3.5">
      <Segmented
        label="Format"
        value={settings.formatKey}
        options={FORMATS.map((format) => ({ value: format.key, label: format.label }))}
        onChange={(key) => update('formatKey', key)}
      />

      <Slider
        label="Corps maximal"
        hint="La borne haute. Là où le tracé se resserre, le texte descend tout seul en dessous."
        value={settings.maxSizeMm}
        min={2}
        max={20}
        step={0.5}
        unit="mm"
        onChange={(value) => update('maxSizeMm', value)}
      />

      <Slider
        label="Corps minimal"
        hint="En dessous, le moteur préfère laisser le tracé nu plutôt qu'écrire illisible."
        value={settings.minSizeMm}
        min={0.5}
        max={6}
        step={0.1}
        unit="mm"
        onChange={(value) => update('minSizeMm', value)}
      />

      <Segmented
        label="Angles trop serrés"
        value={settings.roundCorners ? 'elargir' : 'enjamber'}
        options={[
          { value: 'elargir', label: 'Élargir le virage' },
          { value: 'enjamber', label: 'Laisser nu' },
        ]}
        onChange={(mode) => update('roundCorners', mode === 'elargir')}
      />
      <p className="text-xs leading-snug text-slate-500">
        {settings.roundCorners
          ? 'Le tracé s’ouvre juste assez pour porter le corps minimal. Il s’écarte alors un peu du dessin dans les angles.'
          : 'Le tracé est suivi exactement, et les angles qui ne peuvent pas porter le corps minimal restent sans texte.'}
      </p>

      <Slider
        label="Air autour du texte"
        hint="Part du couloir laissée libre. À 100 %, les lettres se touchent presque."
        value={Math.round(settings.fillRatio * 100)}
        min={40}
        max={100}
        step={5}
        unit="%"
        onChange={(value) => update('fillRatio', value / 100)}
      />

      <Slider
        label="Interlettrage"
        hint="Écarte les lettres les unes des autres, sans toucher à leur taille."
        value={Math.round(settings.tracking * 100)}
        min={-10}
        max={60}
        step={5}
        unit="%"
        onChange={(value) => update('tracking', value / 100)}
      />
    </div>
  )
}
