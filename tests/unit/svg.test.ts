import { describe, expect, it } from 'vitest'
import { renderSvg } from '@/lib/svg'
import type { Composition } from '@/lib/types'

function composition(overrides: Partial<Composition> = {}): Composition {
  return {
    width: 200,
    height: 300,
    glyphs: [
      { char: 'a', x: 10, y: 20, angle: 0, size: 12 },
      { char: 'b', x: 30, y: 40, angle: Math.PI / 2, size: 8 },
    ],
    strokes: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        closed: false,
      },
    ],
    family: 'serif',
    colour: '#0f766e',
    stats: {
      strokes: 1,
      strokeLength: 141,
      glyphs: 2,
      repetitions: 1,
      coverage: 1,
      skippedMm: 0,
      minSizeMm: 2,
      maxSizeMm: 3,
      cramped: 0,
      overlaps: 0,
      timings: {},
    },
    ...overrides,
  }
}

describe('renderSvg', () => {
  it('déclare le bon cadre et la bonne taille', () => {
    const svg = renderSvg(composition())
    expect(svg).toContain('viewBox="0 0 200 300"')
    expect(svg).toContain('width="200"')
    expect(svg).toContain('height="300"')
  })

  it('pose un fond blanc, sauf en surimpression', () => {
    expect(renderSvg(composition())).toContain('fill="#ffffff"')
    // Un SVG transparent s'imprimerait sur n'importe quoi : jamais à l'export.
    expect(renderSvg(composition(), { transparent: true })).not.toContain('fill="#ffffff"')
  })

  it('écrit chaque caractère avec sa rotation et son corps', () => {
    const svg = renderSvg(composition())
    expect(svg).toContain('translate(10 20) rotate(0)')
    expect(svg).toContain('translate(30 40) rotate(90)')
    expect(svg).toContain('font-size="12"')
    expect(svg).toContain('font-size="8"')
  })

  it('pose famille et couleur une seule fois, sur le groupe', () => {
    // Répétées sur chaque caractère, elles pèseraient plus lourd que le texte.
    const svg = renderSvg(composition())
    expect(svg.match(/font-family=/g)).toHaveLength(1)
    expect(svg.match(/fill="#0f766e"/g)).toHaveLength(1)
  })

  it('n’affiche le tracé que sur demande', () => {
    expect(renderSvg(composition())).not.toContain('polyline')
    expect(renderSvg(composition(), { showStroke: true })).toContain('polyline')
  })

  it('sait n’afficher que le tracé, sans le texte', () => {
    const svg = renderSvg(composition(), { strokeOnly: true })
    expect(svg).toContain('polyline')
    expect(svg).not.toContain('<text')
  })

  it('ferme un tracé fermé avec un polygone', () => {
    const closed = composition({
      strokes: [{ points: composition().strokes[0]!.points, closed: true }],
    })
    expect(renderSvg(closed, { showStroke: true })).toContain('<polygon')
  })

  it('échappe le texte de l’utilisateur', () => {
    // Sans ça, une esperluette suffit à produire un SVG invalide, et un chevron à
    // y injecter du balisage.
    const risky = composition({
      glyphs: [
        { char: '&', x: 0, y: 0, angle: 0, size: 10 },
        { char: '<', x: 5, y: 0, angle: 0, size: 10 },
        { char: '>', x: 10, y: 0, angle: 0, size: 10 },
      ],
    })
    const svg = renderSvg(risky)
    expect(svg).toContain('>&amp;<')
    expect(svg).toContain('>&lt;<')
    expect(svg).toContain('>&gt;<')
    expect(svg).not.toContain('><<')
  })

  it('produit un document XML analysable', () => {
    const parsed = new DOMParser().parseFromString(
      renderSvg(composition(), { showStroke: true }),
      'image/svg+xml',
    )
    expect(parsed.querySelector('parsererror')).toBeNull()
    expect(parsed.querySelectorAll('text')).toHaveLength(2)
  })

  it('ne pose pas de groupe de texte quand il n’y a rien à écrire', () => {
    expect(renderSvg(composition({ glyphs: [] }))).not.toContain('<text')
  })
})
