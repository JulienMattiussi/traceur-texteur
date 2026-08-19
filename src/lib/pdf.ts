import { advanceOf, metricsFor } from '@/lib/metrics'
import type { Format } from '@/lib/page'
import type { Composition } from '@/lib/types'

/**
 * Écrit un PDF directement, sans aucune bibliothèque.
 *
 * C'est la seule sortie vraiment maîtrisée : une page web ne peut pas empêcher le
 * navigateur d'ajouter ses en-têtes et sa pagination à l'impression, et son
 * échelle dépend des réglages du dialogue. Ici la page fait exactement le format
 * demandé et rien ne s'y ajoute.
 *
 * Le texte n'est pas embarqué : les trois familles du projet sont celles des
 * quatorze polices de base que tout lecteur PDF possède, et `src/lib/fonts.ts`
 * contient leurs métriques Adobe exactes. C'est ce qui garantit que le PDF est
 * rigoureusement le même dessin que l'aperçu, à la position de glyphe près, plutôt
 * qu'une approximation à recaler.
 */

export interface PdfOptions {
  /** Titre du document, visible dans le lecteur PDF. */
  title?: string
}

/** Un point PostScript vaut 1/72 de pouce ; tout le PDF se mesure ainsi. */
const PER_MM = 72 / 25.4

/**
 * Les caractères que WinAnsiEncoding place hors de Latin-1, entre 0x80 et 0x9F.
 * Partout ailleurs le codage se confond avec Latin-1.
 */
const WIN_ANSI: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

export function renderPdf(
  composition: Composition,
  format: Format,
  options: PdfOptions = {},
): Uint8Array<ArrayBuffer> {
  const { title = 'Traceur-texteur' } = options
  const font = metricsFor(composition.family)

  const pageWidth = format.widthMm * PER_MM
  const pageHeight = format.heightMm * PER_MM
  // La composition a été bâtie aux dimensions exactes du format, donc le rapport
  // est le même dans les deux sens et il n'y a rien à recadrer.
  const scale = pageWidth / composition.width

  const body: string[] = [colourOf(composition.colour), 'BT']
  let currentSize = -1

  for (const glyph of composition.glyphs) {
    const size = round(glyph.size * scale)
    if (size !== currentSize) {
      body.push(`/F1 ${size} Tf`)
      currentSize = size
    }

    const cos = Math.cos(glyph.angle)
    const sin = Math.sin(glyph.angle)

    // Le SVG centre le glyphe sur son avance ; le PDF n'a pas d'ancrage, il faut
    // donc reculer d'une demi-avance le long de la ligne de base.
    const half = advanceOf(font, glyph.char, glyph.size) / 2
    const startX = glyph.x - half * cos
    const startY = glyph.y - half * sin

    // Le PDF a son origine en bas à gauche et son axe vertical vers le haut, donc
    // la rotation y tourne dans l'autre sens : d'où le signe des deux sinus.
    body.push(
      `${round(cos)} ${round(-sin)} ${round(sin)} ${round(cos)} ${round(startX * scale)} ${round(pageHeight - startY * scale)} Tm`,
      `(${escapeText(glyph.char)}) Tj`,
    )
  }

  body.push('ET')
  return assemble(body.join('\n'), title, font.postscript, pageWidth, pageHeight)
}

/** Couleur de remplissage, convertie du `#rrggbb` de l'interface. */
function colourOf(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return '0 g'
  const value = parseInt(match[1]!, 16)
  const channel = (shift: number): number => round(((value >> shift) & 0xff) / 255)
  return `${channel(16)} ${channel(8)} ${channel(0)} rg`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Échappe un caractère pour une chaîne PDF.
 *
 * Tout ce qui sort de l'ASCII est écrit en échappement octal plutôt qu'en octet
 * brut. Ce n'est pas seulement plus lisible : ça garantit qu'un caractère de la
 * source vaut un octet du fichier, dont dépendent les décalages de la table
 * `xref`. Un « é » écrit tel quel les décalerait tous.
 */
function escapeText(char: string): string {
  const code = char.codePointAt(0) ?? 32
  const byte = code <= 0x7e ? code : (WIN_ANSI[code] ?? (code <= 0xff ? code : 0x3f))

  if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`
  if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte)
  return `\\${byte.toString(8).padStart(3, '0')}`
}

/**
 * Assemble les objets, la table des références croisées et la fin de fichier. Les
 * décalages de `xref` sont des positions d'octets exactes : tout est en ASCII, un
 * caractère vaut donc un octet.
 */
function assemble(
  content: string,
  title: string,
  postscript: string,
  pageWidth: number,
  pageHeight: number,
): Uint8Array<ArrayBuffer> {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(pageWidth)} ${round(pageHeight)}] ` +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${postscript} /Encoding /WinAnsiEncoding >>`,
    `<< /Title (${title.replace(/[\\()]/g, (char) => `\\${char}`)}) /Producer (traceur-texteur) >>`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  // Chaque entrée pèse exactement 20 octets, la spécification l'impose.
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n`
  pdf += `startxref\n${xrefAt}\n%%EOF\n`

  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return bytes
}
