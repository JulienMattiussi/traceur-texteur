import { cssFontFamily } from '@/lib/metrics'
import type { Composition, Glyph } from '@/lib/types'

/**
 * Rendu SVG. Une seule implémentation, partagée par l'aperçu et par l'export :
 * ce qui est vu à l'écran est exactement le fichier téléchargé.
 */

export interface SvgOptions {
  /** Montre le tracé sous le texte, pour comprendre ce que le moteur a suivi. */
  showStroke?: boolean
  /** N'affiche que le tracé, sans le texte. */
  strokeOnly?: boolean
  /** Omet le fond blanc. Jamais à l'export : un SVG transparent s'imprime sur n'importe quoi. */
  transparent?: boolean
}

const STROKE_COLOUR = '#cbd5e1'

export function renderSvg(composition: Composition, options: SvgOptions = {}): string {
  const { width, height, glyphs, strokes, colour } = composition
  const { showStroke = false, strokeOnly = false, transparent = false } = options

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  ]

  if (!transparent) parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`)

  if (showStroke || strokeOnly) {
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue
      const points = stroke.points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')
      const tag = stroke.closed ? 'polygon' : 'polyline'
      parts.push(
        `<${tag} points="${points}" fill="none" stroke="${STROKE_COLOUR}" stroke-width="1" stroke-linejoin="round"/>`,
      )
    }
  }

  if (!strokeOnly && glyphs.length > 0) {
    // La famille et la couleur sont posées une fois sur le groupe : répétées sur
    // chaque caractère, elles pèseraient plus lourd que le texte lui-même.
    parts.push(
      `<g font-family="${escapeAttribute(cssFontFamily(composition.family))}" fill="${escapeAttribute(colour)}" text-anchor="middle">`,
    )

    for (const glyph of glyphs) {
      parts.push(
        `<text transform="${glyphTransform(glyph)}" font-size="${round(glyph.size)}">${escapeText(glyph.char)}</text>`,
      )
    }

    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** Position et orientation d'un glyphe. Partagé avec la marque, qui est rendue en JSX. */
export function glyphTransform(glyph: Glyph): string {
  const degrees = round((glyph.angle * 180) / Math.PI)
  return `translate(${round(glyph.x)} ${round(glyph.y)}) rotate(${degrees})`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Le texte vient de l'utilisateur : il faut l'échapper, sans quoi une esperluette
 * suffirait à produire un SVG invalide, et un chevron à y injecter du balisage.
 */
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;')
}
