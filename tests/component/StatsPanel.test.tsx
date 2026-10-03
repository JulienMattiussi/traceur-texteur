import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatsPanel } from '@/components/StatsPanel'
import type { Composition } from '@/lib/types'

function composition(stats: Partial<Composition['stats']> = {}): Composition {
  return {
    width: 840,
    height: 1188,
    glyphs: [],
    strokes: [],
    family: 'serif',
    colour: '#000000',
    stats: {
      strokes: 1,
      strokeLength: 400,
      roundedMm: 0,
      glyphs: 120,
      repetitions: 1.5,
      coverage: 1,
      skippedMm: 0,
      minSizeMm: 3,
      maxSizeMm: 7,
      cramped: 0,
      overlaps: 0,
      timings: { pose: 4 },
      ...stats,
    },
  }
}

describe('StatsPanel', () => {
  it('annonce une composition propre par un symbole et un libellé', () => {
    render(<StatsPanel composition={composition()} />)
    expect(screen.getByRole('status')).toHaveTextContent('✓Aucune lettre')
  })

  it('compte les chevauchements, au singulier comme au pluriel', () => {
    const { rerender } = render(<StatsPanel composition={composition({ overlaps: 1 })} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 paire de lettres se recouvre.')

    rerender(<StatsPanel composition={composition({ overlaps: 3 })} />)
    expect(screen.getByRole('status')).toHaveTextContent('3 paires de lettres se recouvrent.')
  })

  it('ne montre ce qui a été enjambé ou élargi que si c’est le cas', () => {
    const { rerender } = render(<StatsPanel composition={composition()} />)
    expect(screen.queryByText('Enjambé faute de place')).not.toBeInTheDocument()
    expect(screen.queryByText('Virages élargis de')).not.toBeInTheDocument()

    rerender(<StatsPanel composition={composition({ skippedMm: 42, roundedMm: 2.3 })} />)
    expect(screen.getByText('Enjambé faute de place').nextSibling).toHaveTextContent('42 mm')
    expect(screen.getByText('Virages élargis de').nextSibling).toHaveTextContent('2.3 mm')
  })
})
