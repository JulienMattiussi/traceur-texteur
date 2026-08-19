/**
 * La barre est en deux groupes étiquetés, comme dans traceur-compteur et pour la
 * même raison : mélangés, il fallait relire toute la barre pour trouver le bouton
 * de sortie.
 */

interface ToolbarProps {
  showStroke: boolean
  onShowStroke: (value: boolean) => void
  onExportPng: () => void
  onExportSvg: () => void
  onExportPdf: () => void
  onPrint: () => void
  busy: boolean
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function Button({
  onClick,
  disabled,
  pressed,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors disabled:opacity-40 ${
        pressed
          ? 'bg-slate-900 text-white ring-slate-900'
          : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

export function Toolbar({
  showStroke,
  onShowStroke,
  onExportPng,
  onExportSvg,
  onExportPdf,
  onPrint,
  busy,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <Group label="Affichage">
        <Button onClick={() => onShowStroke(!showStroke)} pressed={showStroke}>
          Voir le tracé
        </Button>
      </Group>

      <Group label="Exporter">
        <Button onClick={onExportPng} disabled={busy}>
          PNG
        </Button>
        <Button onClick={onExportSvg}>SVG</Button>
        <Button onClick={onExportPdf}>PDF</Button>
        <Button onClick={onPrint}>Imprimer</Button>
      </Group>
    </div>
  )
}
