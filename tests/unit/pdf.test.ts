import { describe, expect, it } from 'vitest'
import { formatByKey, FORMATS } from '@/lib/page'
import { renderPdf } from '@/lib/pdf'
import type { Composition, FontFamily } from '@/lib/types'

const PER_MM = 72 / 25.4

function composition(overrides: Partial<Composition> = {}): Composition {
  return {
    width: 840,
    height: 1188,
    glyphs: [
      { char: 'a', x: 100, y: 200, angle: 0, size: 24 },
      { char: 'b', x: 140, y: 240, angle: Math.PI / 3, size: 18 },
    ],
    strokes: [],
    family: 'serif',
    colour: '#0f766e',
    stats: {
      strokes: 1,
      strokeLength: 100,
      glyphs: 2,
      repetitions: 1,
      coverage: 1,
      skippedMm: 0,
      minSizeMm: 4,
      maxSizeMm: 6,
      cramped: 0,
      overlaps: 0,
      timings: {},
    },
    ...overrides,
  }
}

const decode = (bytes: Uint8Array): string => String.fromCharCode(...bytes)

describe('renderPdf', () => {
  it('produit un PDF reconnaissable et complet', () => {
    const text = decode(renderPdf(composition(), formatByKey('a4-portrait')))
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Page ')
  })

  it('place les décalages de xref sur des positions d’octets exactes', () => {
    // C'est la seule partie du format qu'on ne peut pas approximer : un décalage
    // faux et le lecteur refuse le fichier. On relit donc le fichier produit.
    const bytes = renderPdf(composition(), formatByKey('a4-portrait'))
    const text = decode(bytes)

    const startxref = /startxref\n(\d+)\n/.exec(text)
    expect(startxref).not.toBeNull()
    expect(text.slice(Number(startxref![1])).startsWith('xref\n')).toBe(true)

    const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text)
    expect(table).not.toBeNull()

    const entries = table![2]!.split('\n').filter((line) => line.length > 0)
    // Chaque entrée pèse exactement 20 octets, la spécification l'impose.
    for (const entry of entries) expect(entry.length).toBe(19)

    // La première entrée est l'objet libre ; les suivantes pointent sur un objet.
    for (let i = 1; i < entries.length; i++) {
      const offset = Number(entries[i]!.slice(0, 10))
      expect(text.slice(offset), `objet ${i}`).toMatch(new RegExp(`^${i} 0 obj\n`))
    }
  })

  it('annonce la longueur réelle du flux', () => {
    const text = decode(renderPdf(composition(), formatByKey('a4-portrait')))
    const declared = Number(/\/Length (\d+) >>\nstream\n/.exec(text)![1])
    const stream = /stream\n([\s\S]*?)\nendstream/.exec(text)![1]!
    expect(stream.length).toBe(declared)
  })

  it('reste entièrement en ASCII, ce dont dépendent les décalages', () => {
    // Un caractère de la source doit valoir un octet du fichier. Un « é » écrit tel
    // quel décalerait toute la table xref.
    const accented = composition({
      glyphs: 'Élève à Noël « ça » – œuf…'.split('').map((char, index) => ({
        char,
        x: 100 + index * 10,
        y: 200,
        angle: 0,
        size: 20,
      })),
    })
    const bytes = renderPdf(accented, formatByKey('a4-portrait'))
    for (const byte of bytes) expect(byte).toBeLessThan(128)
  })

  it('code les caractères hors ASCII en octal WinAnsi', () => {
    const text = decode(
      renderPdf(
        composition({ glyphs: [{ char: 'é', x: 10, y: 10, angle: 0, size: 20 }] }),
        formatByKey('a4-portrait'),
      ),
    )
    // « é » vaut 0xE9 en WinAnsi, soit 351 en octal.
    expect(text).toContain('(\\351) Tj')
  })

  it('code aussi les caractères que WinAnsi place hors de Latin-1', () => {
    const text = decode(
      renderPdf(
        composition({
          glyphs: [
            { char: 'œ', x: 10, y: 10, angle: 0, size: 20 },
            { char: '€', x: 30, y: 10, angle: 0, size: 20 },
          ],
        }),
        formatByKey('a4-portrait'),
      ),
    )
    expect(text).toContain('(\\234) Tj')
    expect(text).toContain('(\\200) Tj')
  })

  it('échappe les parenthèses et l’antislash', () => {
    const text = decode(
      renderPdf(
        composition({
          glyphs: [
            { char: '(', x: 10, y: 10, angle: 0, size: 20 },
            { char: ')', x: 30, y: 10, angle: 0, size: 20 },
            { char: '\\', x: 50, y: 10, angle: 0, size: 20 },
          ],
        }),
        formatByKey('a4-portrait'),
      ),
    )
    expect(text).toContain('(\\() Tj')
    expect(text).toContain('(\\)) Tj')
    expect(text).toContain('(\\\\) Tj')
  })

  it('donne à la page les dimensions exactes du format', () => {
    for (const format of FORMATS) {
      const text = decode(renderPdf(composition(), format))
      const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)
      expect(Number(box![1]), format.key).toBeCloseTo(format.widthMm * PER_MM, 1)
      expect(Number(box![2]), format.key).toBeCloseTo(format.heightMm * PER_MM, 1)
    }
  })

  it('n’écrit qu’une page', () => {
    const text = decode(renderPdf(composition(), formatByKey('a4-portrait')))
    expect(text).toContain('/Count 1')
    expect(text.match(/\/Type \/Page /g)).toHaveLength(1)
  })

  it('embarque le nom PostScript de la famille choisie', () => {
    const expected: Record<FontFamily, string> = {
      sans: 'Helvetica',
      serif: 'Times-Roman',
      mono: 'Courier',
    }
    for (const [family, postscript] of Object.entries(expected)) {
      const text = decode(
        renderPdf(
          composition({ family: family as FontFamily }),
          formatByKey('a4-portrait'),
        ),
      )
      expect(text).toContain(`/BaseFont /${postscript}`)
      // Aucune police embarquée : c'est tout l'intérêt des quatorze de base.
      expect(text).not.toContain('/FontFile')
    }
  })

  it('convertit la couleur de l’interface', () => {
    const text = decode(
      renderPdf(composition({ colour: '#ff8000' }), formatByKey('a4-portrait')),
    )
    expect(text).toContain('1 0.5 0 rg')
  })

  it('retombe sur le noir pour une couleur illisible', () => {
    const text = decode(
      renderPdf(composition({ colour: 'chartreuse' }), formatByKey('a4-portrait')),
    )
    expect(text).toContain('0 g')
  })

  it('ne répète la taille de police que quand elle change', () => {
    const same = composition({
      glyphs: [
        { char: 'a', x: 10, y: 10, angle: 0, size: 20 },
        { char: 'b', x: 30, y: 10, angle: 0, size: 20 },
        { char: 'c', x: 50, y: 10, angle: 0, size: 20 },
      ],
    })
    const text = decode(renderPdf(same, formatByKey('a4-portrait')))
    expect(text.match(/\/F1 [\d.]+ Tf/g)).toHaveLength(1)
  })

  it('inverse le sens de rotation, l’axe vertical du PDF montant', () => {
    const quarter = composition({
      glyphs: [{ char: 'a', x: 100, y: 100, angle: Math.PI / 2, size: 20 }],
    })
    const text = decode(renderPdf(quarter, formatByKey('a4-portrait')))
    // cos, -sin, sin, cos pour un quart de tour : 0 -1 1 0.
    expect(text).toMatch(/0 -1 1 0 [\d.]+ [\d.]+ Tm/)
  })

  it('supporte une composition vide', () => {
    const text = decode(
      renderPdf(composition({ glyphs: [] }), formatByKey('a4-portrait')),
    )
    expect(text).toContain('BT')
    expect(text).toContain('ET')
    expect(text).not.toContain('Tj')
  })
})
