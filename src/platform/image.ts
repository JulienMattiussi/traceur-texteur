import { rgbaToGray } from '@/lib/binarize'

/**
 * La frontière navigateur. `src/lib` reste de la logique pure et testable sans
 * DOM ; ce module est la seule chose qui empêche le moteur de tourner tel quel
 * sous Node, et c'est pour ça qu'il est aussi mince.
 */

export interface LoadedImage {
  name: string
  width: number
  height: number
  gray: Uint8Array
}

/**
 * Décode un fichier image en niveaux de gris via le canvas du navigateur.
 *
 * C'est ce qui permet de tout faire côté client : le navigateur sait déjà lire
 * JPEG, PNG, WebP et GIF, donc aucun codec à embarquer et aucune image envoyée
 * sur un serveur.
 */
export async function loadGrayImage(file: File, maxDimension = 1200): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file)

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Le canvas 2D est indisponible dans ce navigateur.')

    // Fond blanc explicite : un PNG transparent doit devenir du papier, pas du noir.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)

    const { data } = context.getImageData(0, 0, width, height)

    return {
      name: file.name,
      width,
      height,
      gray: rgbaToGray(data),
    }
  } finally {
    bitmap.close()
  }
}

/** Déclenche le téléchargement d'un fichier produit dans le navigateur. */
export function download(filename: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
