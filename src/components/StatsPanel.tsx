import { toMillimetres } from '@/lib/page'
import type { Composition } from '@/lib/types'

/**
 * Les mesures, dont la seule qui décide de tout : le nombre de lettres qui se
 * recouvrent, qui doit rester à zéro.
 *
 * Le voyant ne s'appuie jamais sur la couleur seule, toujours sur un symbole et
 * un libellé. Et les chiffres sont en tailles proportionnelles, pas tabulaires :
 * à cette taille, `tabular-nums` donne à chaque chiffre la largeur d'un zéro et le
 * nombre paraît distendu.
 */

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200/70">
      <div className="text-lg leading-tight font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] leading-snug text-slate-500">{label}</div>
    </div>
  )
}

export function StatsPanel({ composition }: { composition: Composition }) {
  const { stats } = composition
  const clean = stats.overlaps === 0

  return (
    <div className="space-y-3">
      <div
        role="status"
        className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-snug ring-1 ${
          clean
            ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
            : 'bg-amber-50 text-amber-900 ring-amber-200'
        }`}
      >
        <span aria-hidden="true" className="mt-px font-bold">
          {clean ? '✓' : '!'}
        </span>
        <span>
          {clean
            ? 'Aucune lettre n’en recouvre une autre.'
            : `${stats.overlaps} paire${stats.overlaps > 1 ? 's' : ''} de lettres se recouvre${stats.overlaps > 1 ? 'nt' : ''}. Baisse le corps minimal ou l’air autour du texte.`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="lettres posées" value={String(stats.glyphs)} />
        <Tile label="fois le message" value={stats.repetitions.toFixed(1)} />
        <Tile
          label="corps, du plus petit au plus grand"
          value={`${stats.minSizeMm.toFixed(1)} à ${stats.maxSizeMm.toFixed(1)} mm`}
        />
        <Tile label="du tracé couvert" value={`${Math.round(stats.coverage * 100)} %`} />
      </div>

      <dl className="space-y-1 text-xs text-slate-600">
        <div className="flex justify-between gap-2">
          <dt>Tracés suivis</dt>
          <dd className="tabular-nums">{stats.strokes}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Longueur de tracé</dt>
          <dd className="tabular-nums">{Math.round(toMillimetres(stats.strokeLength))} mm</dd>
        </div>
        {stats.skippedMm >= 1 ? (
          <div className="flex justify-between gap-2">
            <dt title="Portions trop étroites pour porter le corps minimal : laissées nues.">
              Enjambé faute de place
            </dt>
            <dd className="tabular-nums">{Math.round(stats.skippedMm)} mm</dd>
          </div>
        ) : null}
        {stats.roundedMm >= 0.1 ? (
          <div className="flex justify-between gap-2">
            <dt title="Écart maximal entre le tracé suivi et le dessin, là où un virage a été élargi pour porter du texte lisible.">
              Virages élargis de
            </dt>
            <dd className="tabular-nums">{stats.roundedMm.toFixed(1)} mm</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Calcul</dt>
          <dd className="tabular-nums">
            {Math.round(Object.values(stats.timings).reduce((total, value) => total + value, 0))} ms
          </dd>
        </div>
      </dl>
    </div>
  )
}
