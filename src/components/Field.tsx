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
  disabled?: boolean
  onChange: (value: number) => void
}

export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
}: SliderProps) {
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
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-sky-500"
      />
      {hint ? <span className="mt-0.5 block text-xs leading-snug text-slate-500">{hint}</span> : null}
    </label>
  )
}

interface SegmentedProps<T extends string> {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/**
 * Un choix visible d'un coup d'oeil. Une liste déroulante cacherait les options,
 * or il n'y en a jamais plus de cinq et savoir ce qui existe fait partie de la
 * compréhension de l'outil.
 */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      ) : null}
      <div
        role="group"
        aria-label={label}
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
