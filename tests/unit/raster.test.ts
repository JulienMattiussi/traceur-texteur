import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rasterize } from '@/platform/raster'

/**
 * La rastérisation, testée avec un canvas simulé.
 *
 * Le rendu du SVG appartient au navigateur et n'a pas à être testé ici. Ce qui
 * nous appartient, et qui a déjà été faux, c'est le reste : passer par un blob et
 * non par une URL de données, imposer un fond opaque, mettre à l'échelle, et
 * révoquer l'URL même quand le rendu échoue.
 */

interface FakeContext {
  fillStyle: string
  fillRect: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
}

let context: FakeContext
let created: { url: string; blob: Blob }[]
let revoked: string[]
/** Contrôle si l'image simulée réussit ou échoue à charger. */
let shouldLoad: boolean

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>'

beforeEach(() => {
  created = []
  revoked = []
  shouldLoad = true

  context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }))
  })

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:faux-${created.length}`
    created.push({ url, blob: blob as Blob })
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url))

  // jsdom ne charge aucune image : on déclenche l'événement nous-mêmes, de façon
  // asynchrone comme le ferait le navigateur.
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (
    this: HTMLImageElement,
  ) {
    Object.defineProperty(this, 'width', { value: 100, configurable: true })
    Object.defineProperty(this, 'height', { value: 50, configurable: true })
    setTimeout(
      () => (shouldLoad ? this.onload?.(new Event('load')) : this.onerror?.(new Event('error'))),
      0,
    )
  })
})

afterEach(() => vi.restoreAllMocks())

describe('rasterize', () => {
  it('rend un PNG', async () => {
    const blob = await rasterize(SVG)
    expect(blob.type).toBe('image/png')
  })

  it('passe le SVG par un blob et non par une URL de données', async () => {
    // Une URL de données encode le document entier en base64 : un texte de
    // plusieurs milliers de glyphes y devient une chaîne de plusieurs mégaoctets.
    await rasterize(SVG)

    expect(created).toHaveLength(1)
    expect(created[0]!.blob.type).toBe('image/svg+xml')
    expect(await created[0]!.blob.text()).toBe(SVG)
  })

  it('impose un fond opaque', async () => {
    // Le SVG destiné à la surimpression est transparent ; un PNG partagé, lui,
    // s'afficherait noir sur les messageries en thème sombre.
    await rasterize(SVG)

    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalled()
    expect(context.fillRect.mock.invocationCallOrder[0]!).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0]!,
    )
  })

  it('agrandit par défaut, parce que le pas de travail est trop grossier', async () => {
    await rasterize(SVG)
    // 4 pixels par millimètre valent environ cent points par pouce : trop peu pour
    // une image partagée, d'où le doublement.
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 100)
  })

  it('accepte une échelle explicite', async () => {
    await rasterize(SVG, 3)
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 300, 150)
  })

  it('révoque l’URL du SVG, y compris quand le rendu échoue', async () => {
    await rasterize(SVG)
    expect(revoked).toEqual([created[0]!.url])

    shouldLoad = false
    await expect(rasterize(SVG)).rejects.toThrow(/SVG/)
    // Sans le `finally`, un export raté fuyait un blob à chaque tentative.
    expect(revoked).toHaveLength(2)
  })

  it('signale un canvas indisponible plutôt que de rendre du vide', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(rasterize(SVG)).rejects.toThrow(/canvas/i)
  })

  it('signale une conversion en PNG impossible', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    await expect(rasterize(SVG)).rejects.toThrow(/PNG/)
  })
})
