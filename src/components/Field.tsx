/**
 * Les deux briques de réglage du projet, partagées par tous les panneaux : un
 * curseur et un choix parmi quelques options. Les dupliquer dans chaque panneau
 * les aurait fait dériver de style.
 */

interface SliderProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

export function Slider({ label, hint, value, min, max, step = 1, unit, onChange }: SliderProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-700">
          {value}
          {unit ? ` ${unit}` : ''}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-sky-500"
      />
      {hint ? (
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

/**
 * Un libellé visible, ou à défaut un nom pour les lecteurs d'écran : sans l'un ni
 * l'autre, le groupe de boutons serait annoncé sans dire ce qu'il choisit.
 */
type SegmentedName = { label: string; ariaLabel?: never } | { label?: never; ariaLabel: string }

type SegmentedProps<T extends string> = SegmentedName & {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/**
 * Un choix visible d'un coup d'oeil. Une liste déroulante cacherait les options,
 * or il n'y en a jamais plus de cinq et savoir ce qui existe fait partie de la
 * compréhension de l'outil.
 */
export function Segmented<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      ) : null}
      <div
        role="group"
        aria-label={label ?? ariaLabel}
        className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              option.value === value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
