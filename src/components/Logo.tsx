import { cssFontFamily } from '@/lib/metrics'
import { LOGO_BOX, LOGO_GLYPHS, LOGO_SPIRAL } from '@/lib/logo'
import { glyphTransform } from '@/lib/svg'

/**
 * La marque. Sa géométrie vit dans `src/lib/logo.ts`, que le favicon partage :
 * voir là-bas pour le pourquoi du dessin.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${LOGO_BOX} ${LOGO_BOX}`} className={className} aria-hidden="true">
      <polyline
        points={LOGO_SPIRAL}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeOpacity="0.28"
        strokeLinecap="round"
      />
      <g fill="currentColor" fontFamily={cssFontFamily('serif')} textAnchor="middle">
        {LOGO_GLYPHS.map((glyph, index) => (
          <text key={index} transform={glyphTransform(glyph)} fontSize={glyph.size.toFixed(2)}>
            {glyph.char}
          </text>
        ))}
      </g>
    </svg>
  )
}

/**
 * Le trait d'union du titre, remplacé par un arc : c'est la liaison courbe qui
 * porte le texte, donc le sujet même de l'application.
 */
export function TitleHyphen() {
  return (
    <svg viewBox="0 0 20 12" className="h-3 w-5 shrink-0 text-sky-500" aria-hidden="true">
      <path
        d="M1 9 Q10 -1 19 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
