import { NEIGHBOURS_8 } from '@/lib/mask'
import type { Mask } from '@/lib/types'

export interface BinarizeOptions {
  /** Seuil 0-255, ou 'auto' pour le calculer par la méthode d'Otsu. */
  threshold?: number | 'auto'
  /** Supprime les taches d'encre de moins de N pixels (bruit JPEG, filigranes). */
  minBlobArea?: number
}

/**
 * Seuil d'Otsu : cherche la coupure qui maximise la variance inter-classe de
 * l'histogramme. Sur du line art (histogramme très bimodal, encre vs papier)
 * c'est fiable et ça évite d'exposer un réglage à l'utilisateur.
 */
export function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Float64Array(256)
  for (let i = 0; i < gray.length; i++) {
    const level = gray[i]!
    histogram[level] = histogram[level]! + 1
  }

  const total = gray.length
  let sum = 0
  for (let v = 0; v < 256; v++) sum += v * histogram[v]!

  let weightBelow = 0
  let sumBelow = 0
  let bestVariance = -1
  let bestThreshold = 128

  for (let t = 0; t < 256; t++) {
    weightBelow += histogram[t]!
    if (weightBelow === 0) continue
    const weightAbove = total - weightBelow
    if (weightAbove === 0) break

    sumBelow += t * histogram[t]!
    const meanBelow = sumBelow / weightBelow
    const meanAbove = (sum - sumBelow) / weightAbove
    const delta = meanBelow - meanAbove
    const variance = weightBelow * weightAbove * delta * delta

    if (variance > bestVariance) {
      bestVariance = variance
      bestThreshold = t
    }
  }

  return bestThreshold
}

/** Convertit une image RGBA (canvas) en niveaux de gris perceptuels. */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4)
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const alpha = rgba[i + 3]! / 255
    const luma = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!
    // Le transparent est du papier, pas de l'encre : on compose sur du blanc.
    gray[p] = Math.round(luma * alpha + 255 * (1 - alpha))
  }
  return gray
}

export function binarize(
  gray: Uint8Array,
  width: number,
  height: number,
  options: BinarizeOptions = {},
): Mask {
  const { threshold = 'auto', minBlobArea = 0 } = options
  const cut = threshold === 'auto' ? otsuThreshold(gray) : threshold

  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = gray[i]! <= cut ? 1 : 0

  const mask: Mask = { width, height, data }
  return minBlobArea > 0 ? despeckle(mask, minBlobArea) : mask
}

/** Retire les composantes connexes d'encre trop petites pour être un trait. */
function despeckle(mask: Mask, minArea: number): Mask {
  const { width, height, data } = mask
  const out = new Uint8Array(data.length)
  const seen = new Uint8Array(data.length)
  const stack: number[] = []
  const component: number[] = []

  for (let start = 0; start < data.length; start++) {
    if (!data[start] || seen[start]) continue

    component.length = 0
    stack.length = 0
    stack.push(start)
    seen[start] = 1

    while (stack.length > 0) {
      const p = stack.pop()!
      component.push(p)
      const x = p % width
      const y = (p - x) / width
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const q = ny * width + nx
        if (!data[q] || seen[q]) continue
        seen[q] = 1
        stack.push(q)
      }
    }

    if (component.length >= minArea) {
      for (const p of component) out[p] = 1
    }
  }

  return { width, height, data: out }
}
