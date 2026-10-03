import { useMemo } from 'react'
import { renderSvg } from '@/lib/svg'
import type { Composition } from '@/lib/types'

interface PreviewProps {
  composition: Composition
  showStroke: boolean
}

export function Preview({ composition, showStroke }: PreviewProps) {
  const svg = useMemo(() => renderSvg(composition, { showStroke }), [composition, showStroke])

  return (
    <div
      className="sheet [&>svg]:h-auto [&>svg]:w-full"
      // Le SVG vient de notre propre moteur, et le seul texte d'utilisateur qui y
      // entre est échappé par `svg.ts`. Une seule implémentation de rendu, partagée
      // avec l'export : ce qui est vu est exactement ce qui est téléchargé.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
