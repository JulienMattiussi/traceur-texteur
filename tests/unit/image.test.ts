import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { download, loadGrayImage } from '@/platform/image'

/**
 * La frontière navigateur, testée avec un canvas simulé.
 *
 * jsdom n'implémente ni `createImageBitmap` ni le contexte 2D, donc les deux sont
 * remplacés. Ce n'est pas pour se donner l'illusion de tester le décodage JPEG,
 * qui appartient au navigateur, mais pour vérifier ce qui **nous** appartient : la
 * réduction à une dimension maximale, le fond blanc imposé sous une image
 * transparente, la conversion en niveaux de gris, et la libération des ressources.
 * C'est le seul module du projet dont une erreur ne se verrait nulle part ailleurs.
 */

interface FakeContext {
  fillStyle: string
  fillRect: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  getImageData: ReturnType<typeof vi.fn>
}

let context: FakeContext
let closed: number
let createdUrls: string[]
let revokedUrls: string[]
/** Ce que le canvas prétend contenir : rempli par le test. */
let pixels: Uint8ClampedArray

function fakeBitmap(width: number, height: number) {
  return { width, height, close: () => (closed += 1) }
}

beforeEach(() => {
  closed = 0
  createdUrls = []
  revokedUrls = []
  pixels = new Uint8ClampedArray([0, 0, 0, 255])

  context = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels })),
  }

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => fakeBitmap(2000, 1000)),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:faux-${createdUrls.length}`
    createdUrls.push(url)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    revokedUrls.push(url)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const file = (name = 'dessin.png') => new File(['contenu'], name, { type: 'image/png' })

describe('loadGrayImage', () => {
  it('réduit l’image à la dimension maximale en gardant ses proportions', async () => {
    // Une photo de téléphone fait plusieurs milliers de pixels de côté : la
    // squelettisation y coûterait des secondes pour aucun gain de tracé.
    const loaded = await loadGrayImage(file(), 400)

    expect(loaded.width).toBe(400)
    expect(loaded.height).toBe(200)
  })

  it('ne grossit jamais une petite image', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap(120, 80)),
    )
    const loaded = await loadGrayImage(file(), 1200)

    expect(loaded.width).toBe(120)
    expect(loaded.height).toBe(80)
  })

  it('impose un fond blanc avant de dessiner', async () => {
    // Un PNG transparent doit devenir du papier, pas de l'encre. Sans ce
    // remplissage, tout le fond passe pour du trait et le dessin est un pâté.
    await loadGrayImage(file(), 4)

    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalled()
    // Le fond est posé avant l'image, sinon il la recouvrirait.
    expect(context.fillRect.mock.invocationCallOrder[0]!).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0]!,
    )
  })

  it('convertit en niveaux de gris perceptuels', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap(2, 1)),
    )
    // Un pixel noir opaque, un pixel blanc opaque.
    pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])

    const loaded = await loadGrayImage(file())

    expect(loaded.gray).toHaveLength(2)
    expect(loaded.gray[0]).toBe(0)
    expect(loaded.gray[1]).toBe(255)
  })

  it('garde le nom du fichier et une URL vers l’original', async () => {
    const loaded = await loadGrayImage(file('lapin.jpg'))

    expect(loaded.name).toBe('lapin.jpg')
    expect(loaded.sourceUrl).toBe(createdUrls[0])
  })

  it('libère le bitmap, même si le décodage échoue en route', async () => {
    // Un bitmap non libéré retient sa mémoire de décodage pour toute la durée de
    // la page, et l'utilisateur peut déposer une image après l'autre.
    await loadGrayImage(file())
    expect(closed).toBe(1)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(loadGrayImage(file())).rejects.toThrow(/canvas/i)
    expect(closed).toBe(2)
  })
})

describe('download', () => {
  it('déclenche le téléchargement puis révoque l’URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    download('composition.svg', '<svg/>', 'image/svg+xml')

    expect(click).toHaveBeenCalledOnce()
    // L'URL d'objet ne doit pas survivre à l'appel, sinon son blob reste en mémoire.
    expect(revokedUrls).toEqual(createdUrls)
  })

  it('nomme le fichier comme demandé', () => {
    let filename = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download
    })

    download('spirale.pdf', new Uint8Array([1, 2]), 'application/pdf')
    expect(filename).toBe('spirale.pdf')
  })
})
