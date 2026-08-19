import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DrawPad } from '@/components/DrawPad'
import type { Point } from '@/lib/types'

/**
 * jsdom ne met en oeuvre ni la mise en page ni la capture de pointeur : sans ces
 * deux prothèses, la surface de tracé mesure zéro pixel et le premier
 * `setPointerCapture` lève. Ce sont les seules choses simulées ; le reste du
 * composant tourne pour de vrai.
 */
const BOX = { x: 0, y: 0, width: 200, height: 100 }

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...BOX,
    top: 0,
    left: 0,
    right: BOX.width,
    bottom: BOX.height,
    toJSON: () => ({}),
  })
})

function Harness({ onChange }: { onChange?: (paths: Point[][]) => void }) {
  const [paths, setPaths] = useState<Point[][]>([])
  return (
    <DrawPad
      aspect={2}
      paths={paths}
      onChange={(next) => {
        setPaths(next)
        onChange?.(next)
      }}
    />
  )
}

const surface = () => screen.getByRole('application', { name: /tracé à la souris/ })

function draw(points: [number, number][]): void {
  const target = surface()
  fireEvent.pointerDown(target, { clientX: points[0]![0], clientY: points[0]![1], pointerId: 1 })
  for (const [x, y] of points.slice(1)) {
    fireEvent.pointerMove(target, { clientX: x, clientY: y, pointerId: 1 })
  }
  fireEvent.pointerUp(target, { pointerId: 1 })
}

describe('DrawPad', () => {
  it('enregistre un trait et le rend', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    draw([
      [10, 10],
      [50, 30],
      [90, 20],
      [150, 60],
    ])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toHaveLength(1)
    expect(screen.getByText('1 tracé.')).toBeInTheDocument()
    expect(document.querySelectorAll('polyline')).toHaveLength(1)
  })

  it('normalise les positions entre 0 et 1', () => {
    // Le composant ne renvoie que des positions brutes normalisées : la mise à
    // l'échelle et le lissage sont du ressort de `page.ts` et de `smooth.ts`.
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    draw([
      [0, 0],
      [100, 50],
      [200, 100],
    ])

    const path = onChange.mock.calls[0]![0][0] as Point[]
    expect(path[0]).toEqual({ x: 0, y: 0 })
    expect(path[1]).toEqual({ x: 0.5, y: 0.5 })
    expect(path[2]).toEqual({ x: 1, y: 1 })
  })

  it('ignore un simple clic', () => {
    // Sous trois points il n'y a pas de trait.
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.pointerDown(surface(), { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(surface(), { pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('accumule plusieurs tracés', () => {
    render(<Harness />)

    draw([
      [10, 10],
      [50, 30],
      [90, 20],
    ])
    draw([
      [10, 80],
      [50, 90],
      [90, 70],
    ])

    expect(screen.getByText('2 tracés.')).toBeInTheDocument()
    expect(document.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('annule le dernier tracé, puis les efface tous', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    draw([
      [10, 10],
      [50, 30],
      [90, 20],
    ])
    draw([
      [10, 80],
      [50, 90],
      [90, 70],
    ])

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('1 tracé.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tout effacer' }))
    expect(document.querySelectorAll('polyline')).toHaveLength(0)
  })

  it('désactive les deux boutons tant que rien n’est tracé', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tout effacer' })).toBeDisabled()
  })

  it('n’enregistre rien quand le pointeur bouge sans être appuyé', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.pointerMove(surface(), { clientX: 40, clientY: 40, pointerId: 1 })
    fireEvent.pointerMove(surface(), { clientX: 80, clientY: 60, pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
