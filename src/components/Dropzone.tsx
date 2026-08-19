import { useRef, useState } from 'react'

interface DropzoneProps {
  onFile: (file: File) => void
  busy: boolean
  currentName: string | null
}

export function Dropzone({ onFile, busy, currentName }: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [hovering, setHovering] = useState(false)

  const take = (files: FileList | null): void => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setHovering(true)
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={(event) => {
        event.preventDefault()
        setHovering(false)
        take(event.dataTransfer.files)
      }}
      className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
        hovering ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-white'
      }`}
    >
      {currentName ? (
        <p className="truncate text-sm font-medium text-slate-900" title={currentName}>
          {currentName}
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Glisse un dessin au trait : silhouette, logo, coloriage
        </p>
      )}

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="mt-2.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? 'Analyse...' : currentName ? 'Changer d’image' : 'Choisir une image'}
      </button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label="Choisir une image"
        className="hidden"
        onChange={(event) => take(event.target.files)}
      />
    </div>
  )
}
