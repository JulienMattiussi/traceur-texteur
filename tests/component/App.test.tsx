import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'

/**
 * Les tests de composant couvrent la structure et les enchaînements, pas l'aspect.
 * Pour juger l'aspect il faut regarder l'application pour de vrai : voir AGENTS.md.
 */

const sheet = (): SVGSVGElement => {
  const svg = document.querySelector('.sheet svg')
  if (!svg) throw new Error('Aucune feuille rendue')
  return svg as SVGSVGElement
}

describe('App', () => {
  it('affiche une composition dès l’ouverture, sans rien demander', () => {
    // Une page vide au démarrage n'apprend rien : la spirale par défaut montre
    // immédiatement ce que fait l'outil.
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Traceur-texteur' })).toBeInTheDocument()
    expect(sheet().querySelectorAll('text').length).toBeGreaterThan(50)
  })

  it('annonce que rien ne se recouvre', () => {
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent(/Aucune lettre/)
  })

  it('réécrit la feuille quand on change le message', async () => {
    const user = userEvent.setup()
    render(<App />)

    const before = sheet().querySelectorAll('text').length
    const field = screen.getByLabelText('Message')
    await user.clear(field)
    await user.type(field, 'court')

    expect(sheet().querySelectorAll('text').length).not.toBe(before)
    expect(sheet().textContent?.replace(/\s/g, '')).toMatch(/^(court)+c?o?u?r?$/)
  })

  it('change de forme à la demande', async () => {
    const user = userEvent.setup()
    render(<App />)

    const before = sheet().querySelectorAll('text').length
    await user.click(screen.getByRole('button', { name: 'Rectangle' }))

    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(sheet().querySelectorAll('text').length).not.toBe(before)
  })

  it('n’expose les tours que pour la spirale', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByLabelText(/^Tours/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cercle' }))
    expect(screen.queryByLabelText(/^Tours/)).not.toBeInTheDocument()
  })

  it('n’expose les dents que pour le zigzag', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByLabelText(/^Dents/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zigzag' }))
    expect(screen.getByLabelText(/^Dents/)).toBeInTheDocument()
  })

  it('montre le tracé sur demande', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(sheet().querySelector('polyline, polygon')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Voir le tracé' }))
    expect(sheet().querySelector('polyline, polygon')).not.toBeNull()
  })

  it('demande un dessin quand la source est une image, et ne rend rien avant', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Dessin' }))
    expect(screen.getByLabelText('Choisir une image')).toBeInTheDocument()
    expect(document.querySelector('.sheet svg')).toBeNull()
    expect(screen.getByText(/Choisis un dessin au trait/)).toBeInTheDocument()
  })

  it('offre une zone de tracé quand la source est la souris', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'À la souris' }))
    expect(screen.getByRole('application', { name: /tracé à la souris/ })).toBeInTheDocument()
    // Rien de tracé, donc rien à composer.
    expect(document.querySelector('.sheet svg')).toBeNull()
  })

  it('compose le texte sur un trait fait à la souris', async () => {
    // Le dernier maillon : du geste brut jusqu'à la feuille, en passant par le
    // lissage et le cadrage. jsdom ne met en oeuvre ni la mise en page ni la
    // capture de pointeur, d'où ces deux prothèses ; tout le reste tourne pour de
    // vrai.
    const user = userEvent.setup()
    Element.prototype.setPointerCapture = vi.fn()
    const box = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      top: 0,
      left: 0,
      right: 300,
      bottom: 400,
      toJSON: () => ({}),
    })

    try {
      render(<App />)
      await user.click(screen.getByRole('button', { name: 'À la souris' }))
      const pad = screen.getByRole('application', { name: /tracé à la souris/ })

      // Une longue diagonale, assez longue pour porter du texte.
      fireEvent.pointerDown(pad, { clientX: 20, clientY: 20, pointerId: 1 })
      for (let i = 1; i <= 40; i++) {
        fireEvent.pointerMove(pad, { clientX: 20 + i * 6, clientY: 20 + i * 9, pointerId: 1 })
      }
      fireEvent.pointerUp(pad, { pointerId: 1 })

      expect(sheet().querySelectorAll('text').length).toBeGreaterThan(20)
      expect(screen.getByRole('status')).toHaveTextContent(/Aucune lettre/)
    } finally {
      box.mockRestore()
    }
  })

  it('change de format, et la feuille avec', async () => {
    const user = userEvent.setup()
    render(<App />)

    const portrait = sheet().getAttribute('viewBox')
    await user.click(screen.getByRole('button', { name: 'A4 paysage' }))
    const landscape = sheet().getAttribute('viewBox')

    expect(landscape).not.toBe(portrait)
    const [, , width, height] = landscape!.split(' ').map(Number)
    expect(width!).toBeGreaterThan(height!)
  })

  it('groupe la barre en affichage et export', () => {
    render(<App />)
    for (const label of ['PNG', 'SVG', 'PDF', 'Imprimer']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // Les deux groupes sont étiquetés, sinon il faut relire toute la barre pour
    // trouver le bouton de sortie.
    expect(screen.getByText('Affichage')).toBeInTheDocument()
    expect(screen.getByText('Exporter')).toBeInTheDocument()
  })

  it('donne la mesure qui compte, le nombre de lettres', () => {
    render(<App />)
    const measures = screen.getByRole('region', { name: 'Mesures' })
    expect(within(measures).getByText('lettres posées')).toBeInTheDocument()
  })
})
